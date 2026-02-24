import type { MaterialStatus, TestMaterial } from '../../../domain/entities/test-material';
import type { MaterialMetadata } from '../../../domain/value-objects/material-metadata';

export interface MaterialRepository {
  create(material: TestMaterial): Promise<void>;
  findById(id: string): Promise<TestMaterial | null>;
  findAll(params?: {
    status?: MaterialStatus;
    limit?: number;
    offset?: number;
  }): Promise<TestMaterial[]>;
  updateStatus(id: string, status: MaterialStatus, error?: string): Promise<void>;
  updateMetadata(id: string, metadata: MaterialMetadata): Promise<void>;
  delete(id: string): Promise<void>;
}
