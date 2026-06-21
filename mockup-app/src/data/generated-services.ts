/* ============================================================
   Collision Engineers — Code App DATA SEAM: generated-service bundle.

   The ONE module that bridges the pac-generated Dataverse services
   (`src/generated/services/*`, which DO import '@microsoft/power-apps') to the
   seam's structural `GeneratedServices` bundle. Keeping the SDK/generated imports
   confined here (+ main.tsx) preserves the offline boundary: the seam barrel
   (`./index`) and `./dataverse-source` stay SDK-free and mock-backed, so the
   default build/tests never pull in '@microsoft/power-apps'.

   Each pac service is a class with STATIC methods
   (getAll/get/create/update/delete); the seam wants an object whose members
   satisfy `GeneratedTableService<TRecord>`. We wrap each class in a thin adapter
   so the call shapes line up exactly and the generated literal-union choice types
   (e.g. cr1bd_status: 100000000 | …) widen cleanly to the seam's `number` record
   fields without fighting TypeScript variance on create/update.

   At RUNTIME the choice integers the SDK returns are exactly the option-set values
   in dataverse/choicesets/*.json (100000000+), which the adapter codecs map to the
   CaseStatus / ActionReason / … string unions — so the data round-trips correctly.
   ============================================================ */

import { Cr1bd_casesService } from '../generated/services/Cr1bd_casesService';
import { Cr1bd_evidencesService } from '../generated/services/Cr1bd_evidencesService';
import { Cr1bd_workprovidersService } from '../generated/services/Cr1bd_workprovidersService';
import { Cr1bd_inspectionaddressesService } from '../generated/services/Cr1bd_inspectionaddressesService';
import { Cr1bd_auditeventsService } from '../generated/services/Cr1bd_auditeventsService';
import { Cr1bd_fieldlevelprovenancesService } from '../generated/services/Cr1bd_fieldlevelprovenancesService';
import { Cr1bd_notesService } from '../generated/services/Cr1bd_notesService';
import { Cr1bd_chasersService } from '../generated/services/Cr1bd_chasersService';

import type {
  GeneratedServices,
  GeneratedTableService,
  GetAllOptions,
  OperationResult,
  CaseRecord,
  EvidenceRecord,
  WorkProviderRecord,
  InspectionAddressRecord,
  AuditEventRecord,
  FieldLevelProvenanceRecord,
  NoteRecord,
  ChaserRecord,
} from './types';

/**
 * The static surface of a pac-generated `<Entity>Service` class the seam reads.
 * Methods are typed loosely (the generated record types are SUPERSETS of the seam
 * records — same cr1bd_* keys, choice columns as literal-int unions that widen to
 * `number`), so a single structural bridge per table is sound. The seam only READS
 * via getAll/get on the M1 binding; create/update are declared for write paths.
 */
interface GeneratedServiceClass {
  getAll(options?: GetAllOptions): Promise<OperationResult<unknown[]>>;
  get(id: string, options?: { select?: string[] }): Promise<OperationResult<unknown>>;
  create(record: never): Promise<OperationResult<unknown>>;
  update(id: string, changedFields: never): Promise<OperationResult<unknown>>;
}

/**
 * Wrap a generated service class as a seam `GeneratedTableService<TSeam>`. Built
 * once per table; the lone `as unknown as` cast bridges the structurally-wider
 * generated record to the seam record (every seam field exists on the generated
 * record with a compatible/widened type), confined to this one wiring module.
 */
function asTableService<TSeam>(svc: GeneratedServiceClass): GeneratedTableService<TSeam> {
  const bridge = {
    getAll: (options?: GetAllOptions) => svc.getAll(options),
    get: (id: string) => svc.get(id),
    create: (record: never) => svc.create(record),
    update: (id: string, changes: never) => svc.update(id, changes),
  };
  return bridge as unknown as GeneratedTableService<TSeam>;
}

/**
 * The injected bundle the Dataverse-backed DataAccess runs over. Built once and
 * handed to `configureDataAccess(...)` at startup (src/main.tsx).
 */
export const generatedServices: GeneratedServices = {
  cases: asTableService<CaseRecord>(Cr1bd_casesService),
  evidence: asTableService<EvidenceRecord>(Cr1bd_evidencesService),
  workProviders: asTableService<WorkProviderRecord>(Cr1bd_workprovidersService),
  inspectionAddresses: asTableService<InspectionAddressRecord>(Cr1bd_inspectionaddressesService),
  auditEvents: asTableService<AuditEventRecord>(Cr1bd_auditeventsService),
  fieldProvenance: asTableService<FieldLevelProvenanceRecord>(
    Cr1bd_fieldlevelprovenancesService,
  ),
  notes: asTableService<NoteRecord>(Cr1bd_notesService),
  chasers: asTableService<ChaserRecord>(Cr1bd_chasersService),
};
