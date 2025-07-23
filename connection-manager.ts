import * as kit from '@solana/kit';
import axios, { AxiosInstance } from 'axios';
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';

export class ConnectionManager {
  private static instance: ConnectionManager;
  private solanaRpc: any
  private httpClient: AxiosInstance;

  private constructor() {
    // Create persistent Solana RPC connection
    this.solanaRpc = kit.createSolanaRpc(
      process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      {

      }
    );

    // Create HTTP client with connection pooling
    this.httpClient = axios.create({
      timeout: 30000, // 30 second timeout
      httpAgent: new HttpAgent({ 
        keepAlive: true,
        maxSockets: 50,
        maxFreeSockets: 10,
        timeout: 60000,
      }),
      httpsAgent: new HttpsAgent({ 
        keepAlive: true,
        maxSockets: 50,
        maxFreeSockets: 10,
        timeout: 60000,
      }),
      headers: {
        'Connection': 'keep-alive',
        'Keep-Alive': 'timeout=30, max=100'
      }
    });

    // Add response interceptor for logging
    this.httpClient.interceptors.response.use(
      (response) => {
        const xRequestId = response.headers['x-request-id'] || 'N/A';
        console.log(`HTTP Response: ${response.status} - x-request-id: ${xRequestId}`);
        return response;
      },
      (error) => {
        console.error('HTTP Error:', error.message);
        return Promise.reject(error);
      }
    );
  }

  public static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  public getSolanaRpc(): any {
    return this.solanaRpc;
  }

  public getHttpClient(): AxiosInstance {
    return this.httpClient;
  }

  // Health check method for GCP readiness probes
  public async healthCheck(): Promise<boolean> {
    try {
      // Test Solana connection
      await this.solanaRpc.getSlot().send();
      return true;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  // Graceful shutdown for GCP
  public async shutdown(): Promise<void> {
    console.log('Shutting down connections...');
    // Axios doesn't need explicit cleanup, but we can destroy agents
    // The HTTP agents will be garbage collected
  }
}

// Export singleton instance
export const connectionManager = ConnectionManager.getInstance(); 