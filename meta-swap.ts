import { spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const sleep = promisify(setTimeout);

// Array to store all swap durations for percentile calculations
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
  const startTime = Date.now();
  const startTimeISO = new Date(startTime).toISOString();
  const logEntry = `${startTimeISO}, Started individual swap\n`;
  
  logToFile(logEntry);

  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['ts-node', 'orca_swap.ts'], {
      stdio: 'inherit',
      cwd: __dirname
    });

    child.on('close', (code) => {
      const endTime = Date.now();
      const duration = endTime - startTime;
      const endTimeISO = new Date(endTime).toISOString();
      
      // Store duration for percentile calculation
      swapDurations.push(duration);
      
      const endLogEntry = `${endTimeISO}, Completed individual swap (exit code: ${code}, duration: ${duration}ms)\n`;
      logToFile(endLogEntry);

      if (code === 0) {
        resolve(duration);
      } else {
        reject(new Error(`Swap script exited with code ${code}`));
      }
    });

    child.on('error', (error) => {
      const errorTime = new Date().toISOString();
      const duration = Date.now() - startTime;
      const errorLogEntry = `${errorTime}, Error in individual swap: ${error.message} (duration: ${duration}ms)\n`;
      
      logToFile(errorLogEntry);
      reject(error);
    });
  });
}

async function runSwapBatch(): Promise<void> {
  console.log('Starting batch of 3 sequential Orca swaps...');
  const startTime = Date.now();
  
  try {
    const duration1 = await runSwapScript();
    const duration2 = await runSwapScript();
    const duration3 = await runSwapScript();
    
    const elapsed = Date.now() - startTime;
    const batchLogEntry = `Batch completed in ${elapsed}ms (individual durations: ${duration1}ms, ${duration2}ms, ${duration3}ms)\n`;
    
    console.log(`✅ ${batchLogEntry.trim()}`);
    logToFile(batchLogEntry);
    
    // Calculate and log current percentiles
    const percentiles = calculatePercentiles(swapDurations);
    const percentileLogEntry = `Current percentiles (${swapDurations.length} swaps): p50=${percentiles.p50}ms, p90=${percentiles.p90}ms, p99=${percentiles.p99}ms\n`;
    
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
=== FINAL STATISTICS ===
Total swaps executed: ${swapDurations.length}
Average duration: ${swapDurations.length > 0 ? Math.round(swapDurations.reduce((a, b) => a + b, 0) / swapDurations.length) : 0}ms
p50 (median): ${finalPercentiles.p50}ms
p90: ${finalPercentiles.p90}ms
p99: ${finalPercentiles.p99}ms
Min duration: ${swapDurations.length > 0 ? Math.min(...swapDurations) : 0}ms
Max duration: ${swapDurations.length > 0 ? Math.max(...swapDurations) : 0}ms
Script completed at ${new Date().toISOString()}
`;

  console.log(finalStats);
  logToFile(finalStats);

  console.log('\n🎉 Orca swap meta script completed!');
  console.log(`📊 Check swap_execution.log for detailed timing data and statistics`);
}

if (require.main === module) {
  main().catch(console.error);
}

// run command: npx ts-node meta-swap.ts 