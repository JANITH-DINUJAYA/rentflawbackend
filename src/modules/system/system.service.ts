import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARNING' | 'ERROR';
  source: string;
  message: string;
}

const MAX_LOGS = 200;

@Injectable()
export class SystemService {
  private logs: LogEntry[] = [];
  private maintenanceMode = false;

  addLog(level: 'INFO' | 'WARNING' | 'ERROR', source: string, message: string): void {
    this.logs.unshift({
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
    });
    if (this.logs.length > MAX_LOGS) {
      this.logs = this.logs.slice(0, MAX_LOGS);
    }
  }

  getLogs(limit = 100): LogEntry[] {
    return this.logs.slice(0, limit);
  }

  getMaintenanceMode(): boolean {
    return this.maintenanceMode;
  }

  setMaintenanceMode(val: boolean): void {
    this.maintenanceMode = val;
    this.addLog(
      'WARNING',
      'SystemAdmin',
      `Maintenance mode ${val ? 'ENABLED' : 'DISABLED'} by administrator`,
    );
  }
}
