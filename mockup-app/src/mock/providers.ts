import type { Provider } from './types';

/** Mock WorkProvider corpus (from the Principals sheet shape). */
export const providers: Provider[] = [
  {
    id: 'prov-ccpy',
    displayName: 'CarCompany Solicitors',
    principalCode: 'CCPY',
    defaultMailbox: 'instructions@collisionengineers.co.uk',
    knownEmailDomains: ['carcompany.co.uk'],
    inspectionLocationPolicy: 'prefer_address',
    providerAutomationMode: 'review_auto',
    active: true,
  },
  {
    id: 'prov-test',
    displayName: 'Test Legal Group',
    principalCode: 'TEST',
    defaultMailbox: 'instructions@collisionengineers.co.uk',
    knownEmailDomains: ['testlegal.co.uk'],
    inspectionLocationPolicy: 'required_address',
    providerAutomationMode: 'review_auto',
    active: true,
  },
  {
    id: 'prov-amls',
    displayName: 'Amber Legal Services',
    principalCode: 'AMLS',
    defaultMailbox: 'images@collisionengineers.co.uk',
    knownEmailDomains: ['amberlegal.co.uk'],
    inspectionLocationPolicy: 'always_image_based',
    providerAutomationMode: 'manual',
    active: true,
  },
  {
    id: 'prov-brdn',
    displayName: 'Bridgen Claims',
    principalCode: 'BRDN',
    defaultMailbox: 'claims@collisionengineers.co.uk',
    knownEmailDomains: ['bridgenclaims.com'],
    inspectionLocationPolicy: 'prefer_address',
    providerAutomationMode: 'review_auto',
    active: true,
  },
];

export function providerByCode(code: string): Provider | undefined {
  return providers.find((p) => p.principalCode === code);
}
