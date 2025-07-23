import { AxiosResponse } from 'axios';
import fs from 'fs';
import { connectionManager } from '../connection-manager';

export async function createAndSignTx(
  path: string,
  accessToken: string,
  signature: string,
  timestamp: number,
  requestBody: string
): Promise<AxiosResponse> {
  const url = `https://api.fordefi.com${path}`;
  
  // Use the shared HTTP client with connection pooling
  const httpClient = connectionManager.getHttpClient();

  try {
    const respTx = await httpClient.post(url, requestBody, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-signature': signature,
        'x-timestamp': timestamp,
        'Content-Type': 'application/json',
      },
      validateStatus: () => true,
    });

    if (respTx.status < 200 || respTx.status >= 300) {
      let errorMessage = `HTTP error occurred: status = ${respTx.status}`;
      // Attempt to parse the response body for additional error info
      try {
        const errorDetail = respTx.data;
        errorMessage += `\nError details: ${JSON.stringify(errorDetail)}`;
      } catch {
        // If not JSON, include raw text
        errorMessage += `\nRaw response: ${respTx.data}`;
      }
      throw new Error(errorMessage);
    }

    // Log the x-request-id and timestamp
    const xRequestId = respTx.headers['x-request-id'] || 'N/A';
    const logEntry = `${new Date().toISOString()}, x-request-id: ${xRequestId}, tx-id: ${respTx.data?.id || 'N/A'}\n`;
    
    try {
      fs.appendFileSync('./swap_requests.log', logEntry);
    } catch (logError) {
      console.warn('Failed to write to log file:', logError);
    }

    return respTx;
  } catch (error: any) {
    // If we have an Axios error with a response, parse it
    if (error.response) {
      let errorMessage = `HTTP error occurred: status = ${error.response.status}`;
      try {
        const errorDetail = error.response.data;
        errorMessage += `\nError details: ${JSON.stringify(errorDetail)}`;
      } catch {
        errorMessage += `\nRaw response: ${error.response.data}`;
      }
      throw new Error(errorMessage);
    }

    // Otherwise, it's a network or unknown error
    throw new Error(`Network error occurred: ${error.message ?? error}`);
  }
};

export async function get_tx(
  path: string,
  accessToken: string,
): Promise<any> {
  const url = `https://api.fordefi.com${path}`;
  
  // Use the shared HTTP client with connection pooling
  const httpClient = connectionManager.getHttpClient();

  try {
    const respTx = await httpClient.request({
      method: 'GET',
      url,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      validateStatus: () => true,
    });

    if (respTx.status < 200 || respTx.status >= 300) {
      let errorMessage = `HTTP error occurred: status = ${respTx.status}`;
      try {
        const errorDetail = respTx.data;
        errorMessage += `\nError details: ${JSON.stringify(errorDetail)}`;
      } catch {
        errorMessage += `\nRaw response: ${respTx.data}`;
      }
      throw new Error(errorMessage);
    }

    return respTx.data;
  } catch (error: any) {
    // If we have an Axios error with a response, parse it
    if (error.response) {
      let errorMessage = `HTTP error occurred: status = ${error.response.status}`;
      try {
        const errorDetail = error.response.data;
        errorMessage += `\nError details: ${JSON.stringify(errorDetail)}`;
      } catch {
        errorMessage += `\nRaw response: ${error.response.data}`;
      }
      throw new Error(errorMessage);
    }
    // Otherwise, it's a network or unknown error
    throw new Error(`Network error occurred: ${error.message ?? error}`);
  }
}