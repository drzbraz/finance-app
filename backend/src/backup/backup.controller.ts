import type { Backup } from '@finance/shared';
import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { BackupService } from './backup.service.js';
import { BackupDto } from './dto/backup.dto.js';

@Controller('backup')
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  @Get()
  export(): Promise<Backup> {
    return this.backup.export();
  }

  /** Replaces everything with the backup's contents. */
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  restore(@Body() backup: BackupDto): Promise<void> {
    return this.backup.restore(backup);
  }
}
