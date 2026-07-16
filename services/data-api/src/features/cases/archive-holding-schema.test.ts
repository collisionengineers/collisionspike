import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const delta=readFileSync(new URL('../../../../../database/migrations/2026-07-13-tkt034-archive-holding.sql',import.meta.url),'utf8');
const canonical=readFileSync(new URL('../../../../../database/baseline/197_archive_holding.sql',import.meta.url),'utf8');
const constraints=readFileSync(new URL('../../../../../database/baseline/900_constraints.sql',import.meta.url),'utf8');

describe('archive holding database race guards',()=>{
  it('rejects link, relink, and detach writes throughout an active remote transfer',()=>{
    expect(delta).toMatch(/CREATE TRIGGER trg_inbound_archive_holding_link_guard BEFORE UPDATE OF case_id ON inbound_email/i);
    expect(delta).toMatch(/NEW\.case_id IS DISTINCT FROM OLD\.case_id[\s\S]*h\.state='adopting'[\s\S]*h\.claim_expires_at>now\(\)/i);
    expect(delta).toMatch(/ERRCODE='55000'/i);
  });

  it('keeps fresh-build and live-delta grants plus RLS policy coverage equivalent',()=>{
    for(const table of ['archive_holding_folder','archive_holding_intake','archive_holding_file','archive_holding_deferred_intake']){
      expect(canonical).toContain(table);
      expect(constraints).toContain(`'${table}'`);
      expect(delta).toContain(`'${table}'`);
    }
    expect(canonical).toContain('GRANT SELECT, INSERT, UPDATE ON archive_holding_folder');
    expect(constraints).toContain('CREATE POLICY p_%1$s_rw');
    expect(constraints).toContain('CREATE POLICY p_%1$s_no_delete');
    expect(delta).toContain("policyname='p_'||t||'_rw'");
    expect(delta).toContain("policyname='p_'||t||'_no_delete'");
    expect(delta).toContain('CREATE POLICY p_%1$s_rw');
    expect(delta).toContain('CREATE POLICY p_%1$s_no_delete');
  });
});
