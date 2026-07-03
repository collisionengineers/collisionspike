import { describe, expect, it } from 'vitest';
import { parseConnectionString } from './telemetry.js';

describe('parseConnectionString', () => {
  it('parses InstrumentationKey + IngestionEndpoint', () => {
    const parsed = parseConnectionString(
      'InstrumentationKey=11111111-2222-3333-4444-555555555555;IngestionEndpoint=https://uksouth-1.in.applicationinsights.azure.com/',
    );
    expect(parsed).toEqual({
      instrumentationKey: '11111111-2222-3333-4444-555555555555',
      ingestionEndpoint: 'https://uksouth-1.in.applicationinsights.azure.com',
    });
  });

  it('trims a trailing slash off the ingestion endpoint', () => {
    const parsed = parseConnectionString(
      'InstrumentationKey=abc;IngestionEndpoint=https://example.com/',
    );
    expect(parsed?.ingestionEndpoint).toBe('https://example.com');
  });

  it('ignores extra segments (LiveEndpoint, ApplicationId, …)', () => {
    const parsed = parseConnectionString(
      'InstrumentationKey=abc;IngestionEndpoint=https://example.com;LiveEndpoint=https://live.example.com;ApplicationId=xyz',
    );
    expect(parsed).toEqual({ instrumentationKey: 'abc', ingestionEndpoint: 'https://example.com' });
  });

  it('is case-insensitive on key names', () => {
    const parsed = parseConnectionString('instrumentationkey=abc;ingestionendpoint=https://example.com');
    expect(parsed).toEqual({ instrumentationKey: 'abc', ingestionEndpoint: 'https://example.com' });
  });

  it('defaults the ingestion endpoint when absent', () => {
    const parsed = parseConnectionString('InstrumentationKey=abc');
    expect(parsed).toEqual({
      instrumentationKey: 'abc',
      ingestionEndpoint: 'https://dc.services.visualstudio.com',
    });
  });

  it('tolerates whitespace around keys/values', () => {
    const parsed = parseConnectionString(' InstrumentationKey = abc ; IngestionEndpoint = https://example.com ');
    expect(parsed).toEqual({ instrumentationKey: 'abc', ingestionEndpoint: 'https://example.com' });
  });

  it('returns undefined for an absent/empty connection string', () => {
    expect(parseConnectionString(undefined)).toBeUndefined();
    expect(parseConnectionString('')).toBeUndefined();
    expect(parseConnectionString('   ')).toBeUndefined();
  });

  it('returns undefined when no InstrumentationKey segment is present', () => {
    expect(parseConnectionString('IngestionEndpoint=https://example.com')).toBeUndefined();
  });

  it('returns undefined for garbage input with no key=value pairs', () => {
    expect(parseConnectionString('not-a-connection-string')).toBeUndefined();
  });
});
