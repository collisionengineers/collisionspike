#!/usr/bin/env python3
"""Prepare the local-only, PII-bearing parse-fed input cache for the Foundry matrix."""
from __future__ import annotations
import argparse, hashlib, json, sys
from pathlib import Path
from typing import Any

SCRIPT_DIR=Path(__file__).resolve().parent
REPO_ROOT=SCRIPT_DIR.parents[2]
sys.path.insert(0, str(SCRIPT_DIR))
import run_eval  # noqa: E402

def digest(value: bytes | str) -> str:
    return hashlib.sha256(value if isinstance(value, bytes) else value.encode()).hexdigest()

def normalise(item: dict[str, Any], max_chars: int) -> dict[str, Any]:
    path=run_eval.resolve_manifest_file(item)
    if path is None or not path.is_file():
        raise FileNotFoundError(item.get('file','(missing manifest path)'))
    fields=run_eval.load_email_fields(path)
    context=dict(item.get('context') or {})
    body=str(fields['body'])
    truncated=len(body)>max_chars
    # The explicit `documents` contract makes later production-faithful attachment
    # extraction additive without changing the matrix runner's input shape.
    return {'id':item['id'],'content_hash':digest(path.read_bytes()),'expected':run_eval.resolve_expected(item,'v2'),
      'input':{'message':{'sender_domain':fields['sender_domain'],'subject':fields['subject'],
      'body':body[:max_chars],'in_reply_to':fields['in_reply_to'],'references':fields['references'],
      'provider_match_state':context.get('provider_match_state','none'),'open_case_ref_match':context.get('open_case_ref_match','none'),
      'attachments':[{'filename':n,'kind':k} for n,k in zip(fields['attachment_filenames'],fields['attachment_kinds'])]},
      'documents':[],'truncation':{'message_body':truncated,'max_chars':max_chars}}}

def main() -> int:
    p=argparse.ArgumentParser(); p.add_argument('--out',type=Path,default=SCRIPT_DIR/'local'/'parsefed-inputs.local.jsonl'); p.add_argument('--max-body-chars',type=int,default=24000); a=p.parse_args()
    items=run_eval.load_manifest(SCRIPT_DIR/'manifest.json'); runnable=[x for x in items if x.get('tracked',True)]
    failures=[]; rows=[]
    for item in runnable:
      try: rows.append(normalise(item,a.max_body_chars))
      except Exception as exc: failures.append(f"{item.get('id','?')}: {type(exc).__name__}")
    if failures: raise SystemExit('ABORT: a tracked benchmark item did not load: '+', '.join(failures))
    a.out.parent.mkdir(parents=True,exist_ok=True); a.out.write_text(''.join(json.dumps(x,separators=(',',':'))+'\n' for x in rows),encoding='utf-8')
    print(f'Prepared {len(rows)} local-only inputs at {a.out}.')
    return 0
if __name__=='__main__': raise SystemExit(main())
