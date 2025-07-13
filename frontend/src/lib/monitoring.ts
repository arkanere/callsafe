import type { CallMetrics, CallQuality } from './types/webrtc.js';

export interface ConnectionMetrics {
  totalAttempts: number;
  successfulConnections: number;
  failedConnections: number;
  averageConnectionTime: number;
  reconnectionAttempts: number;
  lastFailureReason?: string;
}

export interface QualityReport {
  timestamp: number;
  callId: string;
  quality: CallQuality;
  duration: number;
  networkInfo?: {
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
  };
}

export class ConnectionMonitor {
  private metrics: ConnectionMetrics = {
    totalAttempts: 0,
    successfulConnections: 0,
    failedConnections: 0,
    averageConnectionTime: 0,
    reconnectionAttempts: 0
  };

  private qualityReports: QualityReport[] = [];
  private connectionStartTime?: number;
  private onMetricsUpdate?: (metrics: ConnectionMetrics) => void;
  private onQualityReport?: (report: QualityReport) => void;

  startConnectionAttempt(): void {
    this.connectionStartTime = Date.now();
    this.metrics.totalAttempts++;
    this.notifyMetricsUpdate();
  }

  recordConnectionSuccess(): void {
    if (this.connectionStartTime) {
      const connectionTime = Date.now() - this.connectionStartTime;
      this.metrics.successfulConnections++;
      
      // Update average connection time
      const totalSuccessful = this.metrics.successfulConnections;
      this.metrics.averageConnectionTime = 
        (this.metrics.averageConnectionTime * (totalSuccessful - 1) + connectionTime) / totalSuccessful;
      
      this.connectionStartTime = undefined;
      this.notifyMetricsUpdate();
    }
  }

  recordConnectionFailure(reason: string): void {
    this.metrics.failedConnections++;
    this.metrics.lastFailureReason = reason;
    this.connectionStartTime = undefined;
    this.notifyMetricsUpdate();
  }

  recordReconnectionAttempt(): void {
    this.metrics.reconnectionAttempts++;
    this.notifyMetricsUpdate();
  }

  recordQualityReport(callId: string, quality: CallQuality, duration: number): void {
    const report: QualityReport = {
      timestamp: Date.now(),
      callId,
      quality,
      duration,
      networkInfo: this.getNetworkInfo()
    };

    this.qualityReports.push(report);
    
    // Keep only last 50 reports
    if (this.qualityReports.length > 50) {
      this.qualityReports = this.qualityReports.slice(-50);
    }

    if (this.onQualityReport) {
      this.onQualityReport(report);
    }
  }

  private getNetworkInfo() {
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      return {
        effectiveType: connection?.effectiveType,
        downlink: connection?.downlink,
        rtt: connection?.rtt
      };
    }
    return undefined;
  }

  getSuccessRate(): number {
    if (this.metrics.totalAttempts === 0) return 0;
    return (this.metrics.successfulConnections / this.metrics.totalAttempts) * 100;
  }

  getFailureRate(): number {
    if (this.metrics.totalAttempts === 0) return 0;
    return (this.metrics.failedConnections / this.metrics.totalAttempts) * 100;
  }

  getAverageQuality(): 'good' | 'poor' | 'failed' | 'unknown' {
    if (this.qualityReports.length === 0) return 'unknown';

    const qualityCounts = this.qualityReports.reduce((acc, report) => {
      acc[report.quality.level] = (acc[report.quality.level] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const mostCommon = Object.keys(qualityCounts).reduce((a, b) => 
      qualityCounts[a] > qualityCounts[b] ? a : b
    );

    return mostCommon as 'good' | 'poor' | 'failed';
  }

  getRecentQualityTrend(): Array<{ timestamp: number; quality: string }> {
    return this.qualityReports
      .slice(-10) // Last 10 reports
      .map(report => ({
        timestamp: report.timestamp,
        quality: report.quality.level
      }));
  }

  getDetailedMetrics(): ConnectionMetrics & {
    successRate: number;
    failureRate: number;
    averageQuality: string;
    totalReports: number;
  } {
    return {
      ...this.metrics,
      successRate: this.getSuccessRate(),
      failureRate: this.getFailureRate(),
      averageQuality: this.getAverageQuality(),
      totalReports: this.qualityReports.length
    };
  }

  exportMetrics(): {
    connectionMetrics: ConnectionMetrics;
    qualityReports: QualityReport[];
    summary: {
      successRate: number;
      failureRate: number;
      averageQuality: string;
      sessionDuration: number;
    };
  } {
    const firstReport = this.qualityReports[0];
    const lastReport = this.qualityReports[this.qualityReports.length - 1];
    const sessionDuration = firstReport && lastReport 
      ? lastReport.timestamp - firstReport.timestamp 
      : 0;

    return {
      connectionMetrics: { ...this.metrics },
      qualityReports: [...this.qualityReports],
      summary: {
        successRate: this.getSuccessRate(),
        failureRate: this.getFailureRate(),
        averageQuality: this.getAverageQuality(),
        sessionDuration
      }
    };
  }

  reset(): void {
    this.metrics = {
      totalAttempts: 0,
      successfulConnections: 0,
      failedConnections: 0,
      averageConnectionTime: 0,
      reconnectionAttempts: 0
    };
    this.qualityReports = [];
    this.connectionStartTime = undefined;
    this.notifyMetricsUpdate();
  }

  setMetricsUpdateHandler(handler: (metrics: ConnectionMetrics) => void): void {
    this.onMetricsUpdate = handler;
  }

  setQualityReportHandler(handler: (report: QualityReport) => void): void {
    this.onQualityReport = handler;
  }

  private notifyMetricsUpdate(): void {
    if (this.onMetricsUpdate) {
      this.onMetricsUpdate({ ...this.metrics });
    }
  }
}

// Singleton instance for global monitoring
export const connectionMonitor = new ConnectionMonitor();