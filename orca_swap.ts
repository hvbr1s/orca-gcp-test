import { signWithApiSigner } from './signer';
import { swapWithOrca } from './serializers/serialize_swap'
import { createAndSignTx } from './utils/process_tx'
import { pushToJito } from './push_to_jito'
import dotenv from 'dotenv'
import fs from 'fs'

dotenv.config()

export interface FordefiSolanaConfig {
  accessToken: string;
  vaultId: string;
  fordefiSolanaVaultAddress: string;
  privateKeyPem: string;
  apiPathEndpoint: string;
};

export interface OrcaSwapConfig {
  orcaPool: string;
  mintAddress: string;
  swapAmount: bigint;
  useJito: boolean;
  jitoTip: number;
};

// Fordefi Config to configure
export const fordefiConfig: FordefiSolanaConfig = {
  accessToken: process.env.OTHER_API_TOKEN || "",
  vaultId: process.env.OTHER_VAULT_ID || "",
  fordefiSolanaVaultAddress: process.env.OTHER_VAULT_ADDRESS || "",
  privateKeyPem: fs.readFileSync('./secret/private_dan88.pem', 'utf8'),
  apiPathEndpoint: '/api/v1/transactions/create-and-wait'
};

export const swapConfig: OrcaSwapConfig = {
  orcaPool: "Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE", // SOL/USDC pool
  mintAddress: "So11111111111111111111111111111111111111112", // the input token in the swap, SOL in this case
  swapAmount: 1000n, // in lamports
  useJito: false, // if true we'll use Jito instead of Fordefi to broadcast the signed transaction
  jitoTip: 1000, // Jito tip amount in lamports (1 SOL = 1e9 lamports)
};


async function main(): Promise<void> {
  const startTime = new Date().toISOString();
  const logEntry = `${startTime}, Started orca swap execution\n`;
  
  try {
    fs.appendFileSync('./swap_execution.log', logEntry);
  } catch (logError) {
    console.warn('Failed to write to execution log:', logError);
  }

  if (!fordefiConfig.accessToken) {
    console.error('Error: FORDEFI_API_TOKEN environment variable is not set');
    return;
  }
  // We create the tx
  const jsonBody = await swapWithOrca(fordefiConfig, swapConfig)
  console.log("JSON request: ", jsonBody)

  // Fetch serialized tx from json file
  const requestBody = JSON.stringify(jsonBody);

  // Define endpoint and create timestamp
  const timestamp = new Date().getTime();
  const payload = `${fordefiConfig.apiPathEndpoint}|${timestamp}|${requestBody}`;

  try {
    // Send tx payload to API Signer for signature
    const signature = await signWithApiSigner(payload, fordefiConfig.privateKeyPem);
    
    // Send signed payload to Fordefi for MPC signature
    const response = await createAndSignTx(fordefiConfig.apiPathEndpoint, fordefiConfig.accessToken, signature, timestamp, requestBody);
    const data = response.data;
    console.log(data)

    // Log the x-request-id from response headers
    const xRequestId = response.headers['x-request-id'] || 'N/A';
    console.log(`x-request-id: ${xRequestId}`);

    if(swapConfig.useJito){
      try {
        const transaction_id = data.id
        console.log(`Transaction ID -> ${transaction_id}`)
  
        await pushToJito(transaction_id, fordefiConfig.accessToken)
        
        // Log successful Jito completion
        const completionTime = new Date().toISOString();
        const completionEntry = `${completionTime}, Completed orca swap via Jito, tx-id: ${transaction_id}, x-request-id: ${xRequestId}\n`;
        try {
          fs.appendFileSync('./swap_execution.log', completionEntry);
        } catch (logError) {
          console.warn('Failed to write to execution log:', logError);
        }
  
      } catch (error: any){
        console.error(`Failed to push the transaction to Orca: ${error.message}`)
        
        // Log Jito error
        const errorTime = new Date().toISOString();
        const errorEntry = `${errorTime}, Error pushing to Jito: ${error.message}, x-request-id: ${xRequestId}\n`;
        try {
          fs.appendFileSync('./swap_execution.log', errorEntry);
        } catch (logError) {
          console.warn('Failed to write to execution log:', logError);
        }
      }
    } else {
      console.log("Transaction submitted to Fordefi for broadcast ✅")
      console.log(`Transaction ID: ${data.id}`)
      
      // Log successful Fordefi completion
      const completionTime = new Date().toISOString();
      const completionEntry = `${completionTime}, Completed orca swap via Fordefi, tx-id: ${data.id}, x-request-id: ${xRequestId}\n`;
      try {
        fs.appendFileSync('./swap_execution.log', completionEntry);
      } catch (logError) {
        console.warn('Failed to write to execution log:', logError);
      }
    }

  } catch (error: any) {
    console.error(`Failed to sign the transaction: ${error.message}`);
    
    // Log transaction error
    const errorTime = new Date().toISOString();
    const errorEntry = `${errorTime}, Failed to sign transaction: ${error.message}\n`;
    try {
      fs.appendFileSync('./swap_execution.log', errorEntry);
    } catch (logError) {
      console.warn('Failed to write to execution log:', logError);
    }
  }
}

if (require.main === module) {
  main();
};