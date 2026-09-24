/**
 * Jev Brain - Continuous Background Holder Credit Accrual Daemon
 * 
 * Automatically accrues deterministic credits for all verified token holders
 * in the database on a recurring background schedule (every 60 seconds).
 * Ensures holders accumulate rewards continuously 24/7, even without manual interaction.
 */

import { dbAdapter } from '../core/db-adapter.js';
import { accrueCreditsForHolder } from '../core/credit-engine.js';

export class HolderAccrualDaemon {
  constructor(options = {}) {
    this.intervalMs = options.intervalMs || 60_000; // Run every 60 seconds
    this.timer = null;
    this.isAccruing = false;
    this.lastRunAt = null;
    this.totalAccruals = 0;
  }

  /**
   * Start the recurring automated accrual loop
   */
  start(intervalMs = null) {
    if (process.env.NODE_ENV === 'test' || process.argv.some(a => a.includes('test'))) return;
    if (intervalMs) this.intervalMs = intervalMs;
    if (this.timer) return;

    console.log(`[HolderAccrualDaemon] Starting automated background accrual daemon (every ${this.intervalMs / 1000}s)...`);

    // Initial pass after 5s startup delay
    const initialTimer = setTimeout(() => {
      this.runCycle().catch(err => {
        console.warn('[HolderAccrualDaemon] Initial accrual pass error:', err.message);
      });
    }, 5000);
    if (initialTimer.unref) initialTimer.unref();

    this.timer = setInterval(() => {
      this.runCycle().catch(err => {
        console.warn('[HolderAccrualDaemon] Recurring accrual cycle error:', err.message);
      });
    }, this.intervalMs);

    if (this.timer.unref) this.timer.unref();
  }

  /**
   * Stop the background loop
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Execute one complete sweep across all registered holders
   */
  async runCycle() {
    if (this.isAccruing) return;
    this.isAccruing = true;
    try {
      const holders = dbAdapter.getAllHolderAccounts();
      const eligibleHolders = holders.filter(h => (
        Number(h.tierLevel || 0) > 0 ||
        Number(h.tokenBalanceUi || 0) > 0 ||
        Number(h.creditRatePerHour || 0) > 0
      ));

      for (const holder of eligibleHolders) {
        try {
          const res = await accrueCreditsForHolder(holder.walletAddress, { fromDaemon: true });
          if (res && Number(res.accrued || 0) > 0) {
            this.totalAccruals++;
            const shortAddr = `${holder.walletAddress.slice(0, 4)}...${holder.walletAddress.slice(-4)}`;
            console.log(`[HolderAccrualDaemon] Accrued +${res.accrued} credits for ${shortAddr} (Tier ${holder.tierLevel}, ${holder.creditRatePerHour}/hr)`);
          }
        } catch (holderErr) {
          // Non-blocking per-holder error
        }
      }

      // Gentle on-chain re-verification: re-verify at most 1 stale holder (>2h) per cycle to prevent RPC quota exhaustion
      const staleHolder = eligibleHolders.find(h => !h.lastVerifiedAt || (Date.now() - new Date(h.lastVerifiedAt).getTime() > 2 * 3600 * 1000));
      if (staleHolder) {
        try {
          await accrueCreditsForHolder(staleHolder.walletAddress, { fromDaemon: false });
        } catch {}
      }

      this.lastRunAt = new Date().toISOString();
    } catch (err) {
      console.warn('[HolderAccrualDaemon] Sweep error:', err.message);
    } finally {
      this.isAccruing = false;
    }
  }
}

export const holderAccrualDaemon = new HolderAccrualDaemon();
