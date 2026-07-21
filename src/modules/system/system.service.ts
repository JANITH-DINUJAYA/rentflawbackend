import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

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

  // ─── SYSTEM BANK ACCOUNTS ─────────────────────
  async getBankAccounts(includeInactive = false) {
    return this.prisma.systemBankAccount.findMany({
      where: includeInactive ? {} : { is_active: true },
      orderBy: { created_at: 'asc' },
    });
  }

  async createBankAccount(dto: {
    bank_name: string;
    account_name: string;
    account_number: string;
    branch_name?: string;
    swift_code?: string;
  }) {
    const acc = await this.prisma.systemBankAccount.create({
      data: dto,
    });
    this.addLog('INFO', 'SystemConfig', `Created system bank account ${dto.bank_name} - ${dto.account_number}`);
    return acc;
  }

  async updateBankAccount(
    id: string,
    dto: {
      bank_name?: string;
      account_name?: string;
      account_number?: string;
      branch_name?: string;
      swift_code?: string;
      is_active?: boolean;
    },
  ) {
    const existing = await this.prisma.systemBankAccount.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('System bank account not found');

    const updated = await this.prisma.systemBankAccount.update({
      where: { id },
      data: dto,
    });
    this.addLog('INFO', 'SystemConfig', `Updated system bank account ${id}`);
    return updated;
  }

  async deleteBankAccount(id: string) {
    const existing = await this.prisma.systemBankAccount.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('System bank account not found');

    await this.prisma.systemBankAccount.delete({ where: { id } });
    this.addLog('WARNING', 'SystemConfig', `Deleted system bank account ${id}`);
    return { message: 'Bank account deleted' };
  }
}
