import { spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const sleep = promisify(setTimeout);

// Array to store all transaction durations (creation to signature) for percentile calculations
const swapDurations: number[] = [];

function calculatePercentiles(durations: number[]): { p50: number; p90: number; p99: number } {
  if (durations.length === 0) return { p50: 0, p90: 0, p99: 0 };
  
  const sorted = [...durations].sort((a, b) => a - b);
  const len = sorted.length;
  
  const p50 = sorted[Math.floor(len * 0.5)];
  const p90 = sorted[Math.floor(len * 0.9)];
  const p99 = sorted[Math.floor(len * 0.99)];
  
  return { p50, p90, p99 };
}

function logToFile(message: string): void {
  try {
    fs.appendFileSync('./swap_execution.log', message);
  } catch (logError) {
    console.warn('Failed to write to execution log:', logError);
  }
}

async function runSwapScript(): Promise<number> {
  const startTimeISO = new Date().toISOString();
  const logEntry = `${startTimeISO}, Started individual swap\n`;
  
  logToFile(logEntry);

  return new Promise((resolve, reject) => {
    let output = '';
    
    const child = spawn('npx', ['ts-node', 'orca_swap.ts'], {
      stdio: ['inherit', 'pipe', 'pipe'], // Capture stdout to parse duration
      cwd: __dirname
    });

    // Capture stdout to look for duration info
    child.stdout?.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text); // Still show output
    });

    child.stderr?.on('data', (data) => {
      process.stderr.write(data);
    });

    child.on('close', (code) => {
      const endTimeISO = new Date().toISOString();
      
      // Try to extract transaction duration from output
      const durationMatch = output.match(/Transaction creation to signature: (\d+)ms/);
      const txDuration = durationMatch ? parseInt(durationMatch[1]) : 0;
      
      // Store TX duration for percentile calculation (not total script time)
      if (txDuration > 0) {
        swapDurations.push(txDuration);
      }
      
      const endLogEntry = `${endTimeISO}, Completed individual swap (exit code: ${code}, tx-duration: ${txDuration}ms)\n`;
      logToFile(endLogEntry);

      if (code === 0) {
        resolve(txDuration);
      } else {
        reject(new Error(`Swap script exited with code ${code}`));
      }
    });

    child.on('error', (error) => {
      const errorTime = new Date().toISOString();
      const errorLogEntry = `${errorTime}, Error in individual swap: ${error.message}\n`;
      
      logToFile(errorLogEntry);
      reject(error);
    });
  });
}

async function runSwapBatch(): Promise<void> {
  console.log('Starting batch of 3 sequential Orca swaps...');
  const startTime = Date.now();
  
  try {
    const txDuration1 = await runSwapScript();
    const txDuration2 = await runSwapScript();
    const txDuration3 = await runSwapScript();
    
    const elapsed = Date.now() - startTime;
    const batchLogEntry = `Batch completed in ${elapsed}ms (tx durations: ${txDuration1}ms, ${txDuration2}ms, ${txDuration3}ms)\n`;
    
    console.log(`✅ ${batchLogEntry.trim()}`);
    logToFile(batchLogEntry);
    
    // Calculate and log current percentiles
    const percentiles = calculatePercentiles(swapDurations);
    const percentileLogEntry = `Current tx duration percentiles (${swapDurations.length} transactions): p50=${percentiles.p50}ms, p90=${percentiles.p90}ms, p99=${percentiles.p99}ms\n`;
    
    console.log(`📊 ${percentileLogEntry.trim()}`);
    logToFile(percentileLogEntry);
    
  } catch (error) {
    console.error('❌ Swap batch failed:', error);
    logToFile(`Batch failed: ${error}\n`);
    throw error;
  }
}

async function main(): Promise<void> {
  console.log('🚀 Starting Orca swap meta script: 3 sequential swaps, sleep 1s, repeat 10 times');
  console.log('========================================');
  
  // Clear previous log file
  try {
    fs.writeFileSync('./swap_execution.log', `Script started at ${new Date().toISOString()}\n`);
  } catch (error) {
    console.warn('Failed to initialize log file:', error);
  }

  for (let i = 1; i <= 10; i++) {
    console.log(`\n📋 Swap Iteration ${i}/10`);
    logToFile(`\n=== Swap Iteration ${i}/10 ===\n`);
    
    try {
      await runSwapBatch();
      
      if (i < 10) { // Don't sleep after the last iteration
        console.log('😴 Sleeping for 1 second...');
        logToFile('Sleeping for 1 second...\n');
        await sleep(1000);
      }
    } catch (error) {
      console.error(`❌ Swap iteration ${i} failed:`, error);
      logToFile(`Swap iteration ${i} failed: ${error}\n`);
      // break; // Uncomment to stop on first error
    }
  }

  // Final percentile calculation and logging
  const finalPercentiles = calculatePercentiles(swapDurations);
  const finalStats = `
=== FINAL STATISTICS (Transaction Creation to Signature) ===
Total transactions: ${swapDurations.length}
Average tx duration: ${swapDurations.length > 0 ? Math.round(swapDurations.reduce((a, b) => a + b, 0) / swapDurations.length) : 0}ms
p50 (median): ${finalPercentiles.p50}ms
p90: ${finalPercentiles.p90}ms
p99: ${finalPercentiles.p99}ms
Min tx duration: ${swapDurations.length > 0 ? Math.min(...swapDurations) : 0}ms
Max tx duration: ${swapDurations.length > 0 ? Math.max(...swapDurations) : 0}ms
Script completed at ${new Date().toISOString()}
`;

  console.log(finalStats);
  logToFile(finalStats);

  console.log('\n🎉 Orca swap meta script completed!');
  console.log(`📊 Check swap_execution.log for detailed transaction timing data and statistics`);
}

if (require.main === module) {
  main().catch(console.error);
}

// run command: npx ts-node meta-swap.ts 