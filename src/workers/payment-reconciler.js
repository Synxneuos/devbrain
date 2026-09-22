/**
 * Jev Brain - Continuous Background Payment Reconciler
 * 
 * Reconciles pending SOL payouts and stale AI credit reservations.
 * Runs as a continuous daemon on persistent runtimes (VPS / Container).
 * 
 * Never treats RPC null/timeout/processed as failure.
 * Advances state machine deterministically without blind refunds.
 */

import { burnEngine } from '../core/burn-engine.js';
import { reconcileStaleReservations } from '../core/credit-engine.js';

export class PaymentReconciler {
  constructor(options = {}) {
    this.intervalMs = options.intervalMs || 20_000;
    this.timer = null;
    this.isReconciling = false;
    this.lastRunAt = null;
    this.lastResult = null;
    this.lastError = null;
    this.totalRuns = 0;
  }

  /**
   * Start the continuous periodic reconciler loop
   */
  start(intervalMs = null) {
    if (intervalMs) this.intervalMs = intervalMs;
    if (this.timer) return;

    console.log(`[PaymentReconciler] Starting background reconciler loop (every ${this.intervalMs}ms)...`);
    
    // Run immediate first pass
    this.runOnce().catch(err => {
      console.warn('[PaymentReconciler] Initial reconciliation pass error:', err.message);
    });

    this.timer = setInterval(() => {
      this.runOnce().catch(err => {
        console.warn('[PaymentReconciler] Background cycle error:', err.message);
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
      console.log('[PaymentReconciler] Background reconciler loop stopped.');
    }
  }

  /**
   * Execute one reconciliation pass across pending burns and stale AI reservations
   */
  async runOnce() {
    if (this.isReconciling) {
      return { skipped: true, reason: 'ALREADY_RUNNING' };
    }

    this.isReconciling = true;
    this.lastRunAt = new Date().toISOString();
    this.totalRuns++;

    try {
      // 1. Reconcile on-chain SOL payouts (Burn State Machine)
      const burnReconcile = await burnEngine.reconcilePendingBurns();

      // 2. Reconcile stale AI reservations (Two-Phase AI inference)
      const reservationReconcile = reconcileStaleReservations(300_000); // 5 min TTL

      this.lastResult = {
        timestamp: this.lastRunAt,
        burnsReconciled: burnReconcile.reconciled || 0,
        burnActions: burnReconcile.actions || [],
        reservationsReconciled: reservationReconcile.reconciledReservations || 0
      };
      this.lastError = null;

      if ((burnReconcile.reconciled || 0) > 0 || (reservationReconcile.reconciledReservations || 0) > 0) {
        console.log(`[PaymentReconciler] Cycle completed: ${burnReconcile.reconciled || 0} burns resolved, ${reservationReconcile.reconciledReservations || 0} stale reservations released.`);
      }

      return this.lastResult;
    } catch (err) {
      this.lastError = err.message;
      console.error('[PaymentReconciler] Error during reconciliation cycle:', err);
      throw err;
    } finally {
      this.isReconciling = false;
    }
  }

  isRunning() {
    return this.timer !== null;
  }

  getStatus() {
    return {
      active: this.isRunning(),
      intervalMs: this.intervalMs,
      totalRuns: this.totalRuns,
      lastRunAt: this.lastRunAt,
      lastResult: this.lastResult,
      lastError: this.lastError
    };
  }
}

export const paymentReconciler = new PaymentReconciler();
