// box-scope-lib.test.mjs — unit tests for the read-only Box command classifier.
//
// Focus: curl write-detection against a readOnlyRoots target (the production archive
// root 4077648161 — operator decision 2026-07-16). isReadOnlyBoxCommand takes only the
// command string (readOnlyRoots gating happens in the guard), so these tests assert the
// classifier itself: every mutating curl form must classify as NOT read-only, and every
// genuine read form must stay read-only. Run: node --test .claude/hooks/box-scope-lib.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import { isReadOnlyBoxCommand } from './box-scope-lib.mjs';

const ARCHIVE_URL = 'https://api.box.com/2.0/folders/4077648161';

// --- Mutating forms: must NOT classify as read-only -------------------------------------

test('attached method -XDELETE is not read-only', () => {
  assert.strictEqual(isReadOnlyBoxCommand(`curl -XDELETE ${ARCHIVE_URL}`), false);
});

test('attached method -XPOST is not read-only', () => {
  assert.strictEqual(isReadOnlyBoxCommand(`curl -XPOST ${ARCHIVE_URL}`), false);
});

test('spaced method -X DELETE is not read-only', () => {
  assert.strictEqual(isReadOnlyBoxCommand(`curl -X DELETE ${ARCHIVE_URL}`), false);
});

test('--request DELETE is not read-only', () => {
  assert.strictEqual(isReadOnlyBoxCommand(`curl --request DELETE ${ARCHIVE_URL}`), false);
});

test('--json implies POST+body and is not read-only', () => {
  assert.strictEqual(isReadOnlyBoxCommand(`curl --json '{"name":"x"}' ${ARCHIVE_URL}`), false);
});

test('attached data -dDELETE is not read-only', () => {
  assert.strictEqual(isReadOnlyBoxCommand(`curl -dDELETE ${ARCHIVE_URL}`), false);
});

test('attached form -Fx=y is not read-only', () => {
  assert.strictEqual(isReadOnlyBoxCommand(`curl -Fx=y https://upload.box.com/api/2.0/files/content`), false);
});

test('attached upload -Tfile is not read-only', () => {
  assert.strictEqual(isReadOnlyBoxCommand(`curl -Tfile.pdf ${ARCHIVE_URL}`), false);
});

test('spaced -d body is not read-only (regression)', () => {
  assert.strictEqual(isReadOnlyBoxCommand(`curl -d '{"name":"x"}' ${ARCHIVE_URL}`), false);
});

test('--data body is not read-only (regression)', () => {
  assert.strictEqual(isReadOnlyBoxCommand(`curl --data '{"name":"x"}' ${ARCHIVE_URL}`), false);
});

test('--data-raw body is not read-only (regression)', () => {
  assert.strictEqual(isReadOnlyBoxCommand(`curl --data-raw '{"name":"x"}' ${ARCHIVE_URL}`), false);
});

test('--upload-file is not read-only (regression)', () => {
  assert.strictEqual(isReadOnlyBoxCommand(`curl --upload-file f.pdf ${ARCHIVE_URL}`), false);
});

test('--form is not read-only (regression)', () => {
  assert.strictEqual(isReadOnlyBoxCommand(`curl --form name=x ${ARCHIVE_URL}`), false);
});

// --- Read forms: must classify as read-only ---------------------------------------------

test('plain GET url is read-only', () => {
  assert.strictEqual(isReadOnlyBoxCommand(`curl -s ${ARCHIVE_URL}`), true);
});

test('explicit -X GET is read-only', () => {
  assert.strictEqual(isReadOnlyBoxCommand(`curl -X GET ${ARCHIVE_URL}`), true);
});

test('attached -XGET is read-only', () => {
  assert.strictEqual(isReadOnlyBoxCommand(`curl -XGET ${ARCHIVE_URL}`), true);
});

test('-X=GET is read-only', () => {
  assert.strictEqual(isReadOnlyBoxCommand(`curl -X=GET ${ARCHIVE_URL}`), true);
});

test('-X GET at end of command is read-only (GET\\b at end-of-string)', () => {
  assert.strictEqual(isReadOnlyBoxCommand(`curl ${ARCHIVE_URL} -X GET`), true);
});

test('unrelated long flag --dump-header does not disqualify a GET', () => {
  assert.strictEqual(isReadOnlyBoxCommand(`curl --dump-header hdrs.txt ${ARCHIVE_URL}`), true);
});

test('non-curl Box CLI read (folders:items) is read-only', () => {
  assert.strictEqual(isReadOnlyBoxCommand('box folders:items 4077648161'), true);
});

// --- Non-Box commands never qualify (fail-closed default) -------------------------------

test('a non-Box command is not classified read-only', () => {
  assert.strictEqual(isReadOnlyBoxCommand('git status --short'), false);
});
