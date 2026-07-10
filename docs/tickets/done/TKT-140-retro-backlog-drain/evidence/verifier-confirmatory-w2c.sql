SET ROLE csadmin;
\echo === 140-Q1: 34 drain-minted cases invariants (expect 34/34/34/34) ===
WITH minted(id) AS (VALUES
  ('eca2f519-ecb3-4b43-97d0-51b6492dcd8b'::uuid),('9e1d72dd-41c4-45e1-aa73-e1312d29d92a'::uuid),
  ('a9ccfd27-b8a2-4c23-8129-35e0ecfc63d0'::uuid),('56bd159e-56e1-4160-b52d-89e83752b66a'::uuid),
  ('be2f641a-90d9-487f-8a8b-1db0e030c29c'::uuid),('b20aa801-a508-482a-a6db-ef6a10b6f3c9'::uuid),
  ('25b071f8-d281-452c-a83d-3d2390941daf'::uuid),('4c5cd6c9-b609-4c95-8959-3291f301616c'::uuid),
  ('bd7f6fe4-b299-4ed8-baee-dabfacc92552'::uuid),('668af160-0a2f-4fbc-ba80-8b94eb97d620'::uuid),
  ('180d4e3c-2146-4a4c-be1f-511e057fdf2b'::uuid),('a66724d8-c3f6-441e-952e-a9ae0b89a719'::uuid),
  ('40992215-4415-48ad-82f8-da7d47631eb6'::uuid),('c6dcd829-bb3e-41a9-916c-26914798be3d'::uuid),
  ('11a5a1f4-a02d-4900-8cd5-dccb4660cb99'::uuid),('d947218e-a26f-4630-9c1b-aa76346d517a'::uuid),
  ('9630cedf-3397-4534-8271-572e30a9aeed'::uuid),('658d9f37-6599-42d3-a652-982ddced84cc'::uuid),
  ('b543f24c-3b2c-47c8-98b1-6618f01272af'::uuid),('8f267c3f-9ec1-473e-a753-3781749f6a33'::uuid),
  ('67bc1ee1-4c86-4ee2-8af8-a3c3a55c8adb'::uuid),('357d16bf-2839-4265-81c9-77c9038ae883'::uuid),
  ('fd44df9f-b0d6-463b-863d-36242b7b1f43'::uuid),('81211559-efcd-4a85-bcba-f2f7996442b3'::uuid),
  ('e82663a0-3375-4d43-82a8-6d04c888973d'::uuid),('1c420fa6-a2c4-406c-9266-74bb492f1ea6'::uuid),
  ('6f1a0865-b7c9-4f7b-9d03-731da8c13625'::uuid),('444866b4-d2ba-4425-b1e6-2fcd48251bfd'::uuid),
  ('16598ef6-9fd6-4fbd-bab9-a270cac6f191'::uuid),('49da4eb6-4812-4879-bf08-95b39547e7b0'::uuid),
  ('c0819f78-b07e-42f9-8aae-ead94ff2faef'::uuid),('8ef5c430-9763-4584-b192-5c53e7c95293'::uuid),
  ('2b53e628-9db4-404c-aba6-a3b81a4182a1'::uuid),('7e8cea7d-a653-4fba-8d98-74e72ff905c2'::uuid))
SELECT count(*) AS found,
       count(*) FILTER (WHERE c.intake_channel_kind_code = 100000003) AS retro_channel,
       count(*) FILTER (WHERE c.on_hold IS TRUE)  AS held,
       count(*) FILTER (WHERE c.case_po IS NULL)  AS po_null
  FROM minted m JOIN case_ c ON c.id = m.id;
\echo === 140-Q2: 71 drained inbound rows link to the ledger case (expect 71/71) ===
WITH expected(inbound_id, case_id) AS (VALUES
  ('973bbcf3-f606-45e8-a8da-ca202f52a65f'::uuid,'eca2f519-ecb3-4b43-97d0-51b6492dcd8b'::uuid),
  ('47266d55-4fa5-4ba3-8765-54a3b476a181'::uuid,'9e1d72dd-41c4-45e1-aa73-e1312d29d92a'::uuid),
  ('b2333ee7-4e42-445f-8079-4ed823dcbf23'::uuid,'a9ccfd27-b8a2-4c23-8129-35e0ecfc63d0'::uuid),
  ('d71e30e7-43e8-4d62-9ece-7b4b484eedd0'::uuid,'56bd159e-56e1-4160-b52d-89e83752b66a'::uuid),
  ('3e727ed5-9d65-46c3-a2fd-40f37c028752'::uuid,'be2f641a-90d9-487f-8a8b-1db0e030c29c'::uuid),
  ('5ba72558-0f89-468c-8b83-6a7931416692'::uuid,'b20aa801-a508-482a-a6db-ef6a10b6f3c9'::uuid),
  ('58ce43ca-47b8-448f-8d85-dec1b66efe90'::uuid,'25b071f8-d281-452c-a83d-3d2390941daf'::uuid),
  ('1e742ad8-936b-4413-8988-aef23fa66b2d'::uuid,'4c5cd6c9-b609-4c95-8959-3291f301616c'::uuid),
  ('0ddc8326-c9c6-4c02-9c5e-20ed789f2ccd'::uuid,'bd7f6fe4-b299-4ed8-baee-dabfacc92552'::uuid),
  ('984dd3ab-23a4-406f-bf4f-af2a76a04d14'::uuid,'668af160-0a2f-4fbc-ba80-8b94eb97d620'::uuid),
  ('4b9b99da-dfa3-4661-b1e3-5d8c3d688446'::uuid,'180d4e3c-2146-4a4c-be1f-511e057fdf2b'::uuid),
  ('974dfb68-67fc-437e-a388-0b74b2a574cb'::uuid,'a66724d8-c3f6-441e-952e-a9ae0b89a719'::uuid),
  ('dd84dd7d-762a-451b-97c7-fda175462da3'::uuid,'40992215-4415-48ad-82f8-da7d47631eb6'::uuid),
  ('940467dd-f024-4cc2-b1b5-364b6e5622a5'::uuid,'c6dcd829-bb3e-41a9-916c-26914798be3d'::uuid),
  ('6cbec582-204a-4f4d-9677-3106e3b23625'::uuid,'11a5a1f4-a02d-4900-8cd5-dccb4660cb99'::uuid),
  ('1c2b100c-eaec-44a8-9b0f-a08ec611f638'::uuid,'d947218e-a26f-4630-9c1b-aa76346d517a'::uuid),
  ('0cf6ce4b-7c69-4edd-93dd-2243d0a8c38a'::uuid,'9630cedf-3397-4534-8271-572e30a9aeed'::uuid),
  ('b4d57b5b-b254-446b-ac94-c67826f01da2'::uuid,'658d9f37-6599-42d3-a652-982ddced84cc'::uuid),
  ('3b5b1a6e-78f1-460c-b0bb-48246ebf9c77'::uuid,'b543f24c-3b2c-47c8-98b1-6618f01272af'::uuid),
  ('60343616-6edd-4ef4-a4c9-446975061399'::uuid,'8f267c3f-9ec1-473e-a753-3781749f6a33'::uuid),
  ('fa11908f-a49f-4398-ac90-31a8f6297fef'::uuid,'67bc1ee1-4c86-4ee2-8af8-a3c3a55c8adb'::uuid),
  ('9e7bf40f-3505-43e5-ae20-60306a780221'::uuid,'357d16bf-2839-4265-81c9-77c9038ae883'::uuid),
  ('f9c04399-6e08-45b7-805e-bdd753190f92'::uuid,'fd44df9f-b0d6-463b-863d-36242b7b1f43'::uuid),
  ('e22e9b15-5d6b-4900-a8bc-9d92f4e5f31c'::uuid,'81211559-efcd-4a85-bcba-f2f7996442b3'::uuid),
  ('ccd95a95-046e-44b1-a32c-162e32d500f2'::uuid,'e82663a0-3375-4d43-82a8-6d04c888973d'::uuid),
  ('b8a2e8e9-6ab2-4356-81f7-ecb3857b0780'::uuid,'1c420fa6-a2c4-406c-9266-74bb492f1ea6'::uuid),
  ('bdbe2b55-3e37-449e-a48b-737d4dbccb42'::uuid,'6f1a0865-b7c9-4f7b-9d03-731da8c13625'::uuid),
  ('2ff5cfc5-8b00-4446-9a70-677a075d26f6'::uuid,'444866b4-d2ba-4425-b1e6-2fcd48251bfd'::uuid),
  ('bcfcfbc8-eb58-4580-8cbc-b7f5c58cbcb9'::uuid,'16598ef6-9fd6-4fbd-bab9-a270cac6f191'::uuid),
  ('6add7844-974f-456b-97af-fa67db8819f6'::uuid,'49da4eb6-4812-4879-bf08-95b39547e7b0'::uuid),
  ('65e46447-0aa3-4eaa-80da-fe565f6698df'::uuid,'c0819f78-b07e-42f9-8aae-ead94ff2faef'::uuid),
  ('f9a77fcc-3362-440a-9223-83a721b3c01a'::uuid,'8ef5c430-9763-4584-b192-5c53e7c95293'::uuid),
  ('19c4549d-5df8-47fd-b7ba-d88778298f78'::uuid,'2b53e628-9db4-404c-aba6-a3b81a4182a1'::uuid),
  ('0e151228-0e36-4744-a299-ea543f4506e8'::uuid,'7e8cea7d-a653-4fba-8d98-74e72ff905c2'::uuid),
  ('a1f22ce3-1aee-4749-9a13-02e4060ceb78'::uuid,'a9ccfd27-b8a2-4c23-8129-35e0ecfc63d0'::uuid),
  ('3bc6a550-0e10-4d05-b443-36a59f9594cc'::uuid,'56bd159e-56e1-4160-b52d-89e83752b66a'::uuid),
  ('0ae7e88c-a90c-4763-b2cd-4a07f1d2f7fd'::uuid,'be2f641a-90d9-487f-8a8b-1db0e030c29c'::uuid),
  ('c0e74ce8-e950-4e99-a5c6-8101b2ad27f5'::uuid,'b20aa801-a508-482a-a6db-ef6a10b6f3c9'::uuid),
  ('e31f91cd-425e-4b1d-b7aa-8b6bf3c31dea'::uuid,'4c5cd6c9-b609-4c95-8959-3291f301616c'::uuid),
  ('85ed4d4d-b41a-4810-bc24-3287d6097d56'::uuid,'4c5cd6c9-b609-4c95-8959-3291f301616c'::uuid),
  ('c0952c38-a269-4f20-8a51-2dd38f50d9ac'::uuid,'d2e17148-a391-473d-be28-35ac36c7a8bb'::uuid),
  ('c9f82a2a-6a0d-4848-9014-5ffc42fd3ac9'::uuid,'d2e17148-a391-473d-be28-35ac36c7a8bb'::uuid),
  ('43521747-c7df-45f2-9fc7-daaac49b350e'::uuid,'180d4e3c-2146-4a4c-be1f-511e057fdf2b'::uuid),
  ('97bcf4a6-d889-49f9-a697-5e6e5465462f'::uuid,'668af160-0a2f-4fbc-ba80-8b94eb97d620'::uuid),
  ('d4581837-817f-4e20-ae2b-f14e695e41ad'::uuid,'a66724d8-c3f6-441e-952e-a9ae0b89a719'::uuid),
  ('1ab4d16f-8dc1-4784-a311-370285c097c6'::uuid,'40992215-4415-48ad-82f8-da7d47631eb6'::uuid),
  ('ff1bf2e6-a6e8-4dc9-957e-961a3b23c7e5'::uuid,'a66724d8-c3f6-441e-952e-a9ae0b89a719'::uuid),
  ('48bab1eb-dd5a-4fc6-aeee-a9409aee48b5'::uuid,'9630cedf-3397-4534-8271-572e30a9aeed'::uuid),
  ('914d50ca-1bb8-4255-8d2a-9145ea2a46cd'::uuid,'b37dd650-3c0c-4b7c-b9c7-8bac0d4e911d'::uuid),
  ('01dff2b5-edf1-46e2-aee6-cb100ffdcd68'::uuid,'67bc1ee1-4c86-4ee2-8af8-a3c3a55c8adb'::uuid),
  ('5c5364a7-8d47-4715-b2ba-e4297c7c56a8'::uuid,'357d16bf-2839-4265-81c9-77c9038ae883'::uuid),
  ('f8924497-e68b-4af1-9c08-d209c864474d'::uuid,'67bc1ee1-4c86-4ee2-8af8-a3c3a55c8adb'::uuid),
  ('4e73fe72-e215-46ba-99d3-42aee6f03317'::uuid,'1d74e0da-667b-49d2-8b84-ab9d0d47fcba'::uuid),
  ('e85a7386-99e6-4089-a805-c17878969a0d'::uuid,'9d85a360-1798-4629-80e4-8212cebe2a92'::uuid),
  ('edf92584-d5f2-48d0-bed1-95cf5002f5b8'::uuid,'1d74e0da-667b-49d2-8b84-ab9d0d47fcba'::uuid),
  ('87ec3a51-6fa8-48b7-9bd5-ad1ab15511e0'::uuid,'dc4b2059-cbc4-4f13-b997-cd070095eaf7'::uuid),
  ('5b5f4dd0-cf98-4eed-9673-22eef5aacad3'::uuid,'1d74e0da-667b-49d2-8b84-ab9d0d47fcba'::uuid),
  ('55d89fc8-de05-4f9a-8ec2-82df08ba4a41'::uuid,'0b07b3d3-ecd6-49ed-9e35-a95e841aabf0'::uuid),
  ('ace1bfb8-487b-4f4a-9e37-f6465fb7852e'::uuid,'dc693f76-2936-471e-bca0-a382fa610fe0'::uuid),
  ('84c72717-21b4-44d9-a7ad-a34c8048cf93'::uuid,'0476fa7c-76e7-4890-b071-f4bbdb736275'::uuid),
  ('5db226a7-9e8b-4f48-a04f-eed69a0cf9a9'::uuid,'df9a2069-58fb-4faa-8878-b5c79387890f'::uuid),
  ('c19d4239-8dc7-4008-a4f1-b2f540b404d6'::uuid,'40992215-4415-48ad-82f8-da7d47631eb6'::uuid),
  ('b29417b5-7b10-4651-8cc7-2874295472f0'::uuid,'16598ef6-9fd6-4fbd-bab9-a270cac6f191'::uuid),
  ('b8e69c8f-1eae-4603-bd50-28f8622284b7'::uuid,'ec468d1e-cdc5-4223-bfd4-93f4fdb4bc1d'::uuid),
  ('2749abce-dff3-4be0-a4dd-8cb75a1218af'::uuid,'ec468d1e-cdc5-4223-bfd4-93f4fdb4bc1d'::uuid),
  ('4ab9051d-8b1b-4ad4-809f-28f3b25e8cdf'::uuid,'beb0a8a8-f6bb-4805-afe6-d03e64343032'::uuid),
  ('a5b08995-0e26-45f8-a9c2-d98a68ed0352'::uuid,'40992215-4415-48ad-82f8-da7d47631eb6'::uuid),
  ('6598313d-8426-4138-99aa-57a67e66d222'::uuid,'da6821ae-a006-4568-aaec-2d079415f270'::uuid),
  ('d731354e-9a4d-4c8f-804a-565f9a8c1d00'::uuid,'ec468d1e-cdc5-4223-bfd4-93f4fdb4bc1d'::uuid),
  ('1b3209e9-fcce-414f-bd37-b4ca8d375069'::uuid,'540108ca-0bb2-40f1-9f45-2de4463e7900'::uuid),
  ('eb399785-8759-4a05-8e74-1bd353a6a877'::uuid,'beb0a8a8-f6bb-4805-afe6-d03e64343032'::uuid))
SELECT count(*) AS pairs,
       count(*) FILTER (WHERE ie.case_id = e.case_id) AS matching
  FROM expected e JOIN inbound_email ie ON ie.id = e.inbound_id;
\echo === 140-Q3: the 6 no_source rows stamped (expect 6/6/6) ===
SELECT count(*) AS rows_found,
       count(*) FILTER (WHERE case_id IS NULL) AS still_uncased,
       count(*) FILTER (WHERE attention_reason = 'unable_to_locate') AS stamped
  FROM inbound_email
 WHERE id IN ('8edbf3a2-8bcd-4119-bbdd-fb3a030e63b8','898225f7-3863-43be-97fa-f57401ad80c5',
              'eb0ffc2a-f620-4ea4-acd4-9a046c5f080a','a36da0bf-4b19-4ef6-a81f-19265d1b3ff6',
              '83e6d271-270d-404b-8588-a20ab04f11b6','5899538d-564e-4fcf-898c-13304dc9f5de');
\echo === 140-Q4: the 19 trigger_not_found rows (expect 19/19/19) ===
SELECT count(*) AS rows_found,
       count(*) FILTER (WHERE case_id IS NULL) AS still_uncased,
       count(*) FILTER (WHERE case_id IS NULL AND attention_reason IS NULL) AS unstamped
  FROM inbound_email
 WHERE id IN ('aa536fe6-81bc-43d7-a768-ccb38fc93f3f','f7c79b42-78c8-4962-8afb-464779cca01e',
              '457371c6-073c-4146-970d-5b6ea1312d46','bda17710-a257-468a-9d9a-d27d84534e69',
              'f7250355-09f4-413c-ad70-a0e38d8f9fc0','db3ace97-f9a1-4a10-9c8b-763b9d8e109a',
              '46f60420-aee5-4326-bcdb-ce80c3842ffc','055a5b41-358f-4ae9-b0c4-81cd9efe7892',
              '0367d3f7-e362-4835-8115-617e68872858','ce1f8f9a-194f-4f89-a763-3f0bcb59f635',
              'bf7ca211-32c4-4e13-94ce-3c1d87fadee2','0183a12f-802b-49c8-b4be-1582e31ff630',
              '1090cef2-0cdb-4825-a962-f117e9425a84','f4713001-694c-4701-9154-b81c482110f5',
              'dfd0909b-f528-4be1-a0da-a6a83907b8df','0a9a28d9-5497-4672-a5b9-90e728219ff4',
              'f3e77a3a-ae78-4d8d-8975-267617038916','6ba5500e-1741-4199-8f7e-2b30c8d5034e',
              'd6116210-f0bd-4560-94de-2e831cf4421f');
\echo === 140-Q5: drain-window audit trail ===
SELECT ca.name, count(*) AS n
  FROM audit_event ae JOIN choice_audit_action ca ON ca.code = ae.action_code
 WHERE ae.occurred_at >= '2026-07-10T15:28:00Z' AND ae.occurred_at < '2026-07-10T15:51:00Z'
   AND ca.name IN ('retro_case_created','retro_case_linked','retro_reconstruction_failed')
 GROUP BY ca.name ORDER BY ca.name;
\echo === 140-Q6: standing Held invariant regression (expect 0 rows) ===
SELECT c.id, c.on_hold, c.case_po
  FROM case_ c
 WHERE c.intake_channel_kind_code = 100000003
   AND (c.on_hold IS NOT TRUE OR c.case_po IS NOT NULL);
