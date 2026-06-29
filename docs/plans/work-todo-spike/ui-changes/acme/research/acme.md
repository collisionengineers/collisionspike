# Research pack: provider domain placeholder shows acme.co.uk

## Source ticket

`docs/plans/work-todo-spike/ui-changes/acme/acme.md`

The ticket notes that every provider has `acme.co.uk` shown in a grey text box.

## What is happening

This is a static placeholder in the provider admin editor, not provider data:

- `ProviderEditor` is rendered for each provider in `mockup-app/src/screens/Admin.tsx:477`.
- Known email domains are rendered as real tags from `draft.knownEmailDomains` around `mockup-app/src/screens/Admin.tsx:609-619`.
- The empty input below those tags has `placeholder="acme.co.uk"` in `mockup-app/src/screens/Admin.tsx:624-627`.

Because a placeholder appears for every provider editor, every provider appears to have the same example domain even when its real domain tags are different.

## Why it happens

The UI uses a generic example domain in the input placeholder. It is visually grey, but in context it looks like provider-specific data.

Real known email domains come from the provider corpus:

- `work_provider.known_email_domains` is defined in `migration/assets/schema/010_work_provider.sql:17`.
- Seed data imports known domains by principal code in `migration/assets/schema/seed/910_seed_corpus.sql:150`.
- API mapping sends `knownEmailDomains` through `api/src/lib/mappers.ts:285`.

There is a second issue: provider editing is not currently a complete persisted workflow.

- The providers API exposes read routes in `api/src/functions/providers.ts:16`.
- The REST client exposes provider reads around `mockup-app/src/data/rest-client.ts:122`.
- The shared `DataAccess` surface has no provider update method around `packages/domain/src/dto/index.ts:285`.
- The Admin save action currently shows a toast without a matching persisted provider update around `mockup-app/src/screens/Admin.tsx:568`.

So the placeholder makes the field look editable and provider-specific even though durable provider-domain editing is not wired end to end.

## Affected files

- `mockup-app/src/screens/Admin.tsx` - provider editor, domain tags, placeholder, save action.
- `api/src/functions/providers.ts` - provider read API; update route would live here if editing is implemented.
- `mockup-app/src/data/rest-client.ts` - provider update client method if editing is implemented.
- `packages/domain/src/dto/index.ts` - shared provider update contract if editing is implemented.
- `api/src/lib/mappers.ts` - provider domain mapping.
- `migration/assets/schema/010_work_provider.sql` - provider domain storage.
- `migration/assets/schema/seed/910_seed_corpus.sql` - seeded provider domain corpus.

## Changes that would resolve it

1. Remove the fake placeholder.
   - The minimal fix is to delete `placeholder="acme.co.uk"` from the input.
   - Keep an accessible label or `aria-label` so the input remains understandable without showing fake data.

2. Do not replace it with another fake domain.
   - If helper text is needed, use plain wording outside the field, for example `Add a sender domain`.
   - Do not show an example that can be mistaken for provider data.

3. Decide whether provider-domain editing should actually persist.
   - If yes, add a provider update API, DTO method, REST client method, validation, audit, and tests.
   - If no, disable or remove edit affordances that imply changes are saved.

4. Test the admin view.
   - Component-test a provider with no known domains and a provider with existing domains.
   - Assert the placeholder does not show fake provider data.

## Open checks before implementation

- Confirm whether the provider admin page is intended for live editing now, or whether it is only a review surface until a persisted update path is added.
