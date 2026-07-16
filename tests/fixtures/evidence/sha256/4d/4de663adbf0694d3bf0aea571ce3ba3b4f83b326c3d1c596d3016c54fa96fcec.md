# Inspection-location (Loc) vs Principal

**Loc = where the vehicle is being inspected** — we want it complete wherever
possible. This document answers two questions from `everyrepairloc.xlsx` (the
authoritative-Loc export). Generated 2026-06-18; reproducible via
`python outputs/_scripts/task8_loc_principals.py`.

Of the located cases: **5,743 carry a full postcode** and **7,474
carry only a part postcode** (district/outward code). Partial = an incomplete
inspection location we would want to resolve to a full address.

---

## Q1 — Principals with a PART postcode in Loc (by frequency)

201 principals have at least one part-only Loc, spread over
638 distinct districts and 7,474 cases. Resolving the
**highest-frequency** part postcodes to full addresses gives the biggest coverage win.

### A. By part-postcode frequency — every `(principal, district)` ranked by count
Full data: **`loc_part_postcodes_by_principal.csv`**. Top 25:

| # | Part district | Principal | Name | Cases |
|---|---|---|---|---|
| 1 | M12 | QCL | QCL (QCL) | 814 |
| 2 | CH65 | SS | Savas & Savage | 495 |
| 3 | B5 | FW | Fairway Solicitors | 355 |
| 4 | LU1 | RJS | Robert James Solicitors | 285 |
| 5 | RH10 | RJS | Robert James Solicitors | 234 |
| 6 | CH41 | DFD | DFD (Richard or Joshua) Also | 231 |
| 7 | BL3 | MP | Montreal Prestige | 195 |
| 8 | B6 | BLACK | BlackStone | 193 |
| 9 | B70 | GG | Graham Coffey (GGP) | 185 |
| 10 | OL2 | GG | Graham Coffey (GGP) | 113 |
| 11 | CH46 | DFD | DFD (Richard or Joshua) Also | 104 |
| 12 | DE23 | HTU | HTU Assessors Ltd | 101 |
| 13 | B12 | RJS | Robert James Solicitors | 95 |
| 14 | LU4 | RJS | Robert James Solicitors | 88 |
| 15 | RH10 | ACSP | Accident Specialists (Direct | 78 |
| 16 | EN1 | FW | Fairway Solicitors | 76 |
| 17 | B9 | KBS | Knightsbridge (KBS) | 70 |
| 18 | B12 | FA | Fort Assist Digbeth Court Bu | 68 |
| 19 | M19 | MBH | MBH Solicitors | 65 |
| 20 | OL2 | SWADE | Swade Soloutions Ltd | 65 |
| 21 | ST3 | KBS | Knightsbridge (KBS) | 61 |
| 22 | M1 | KMR | KMR | 57 |
| 23 | G41 | TL | Trident Lloyd | 55 |
| 24 | CH5 | YML | YM Law/ NETWORK HD UK | 51 |
| 25 | SW16 | MP | Montreal Prestige | 49 |

### B. By principal — who has the most incomplete locations
Full data: **`loc_part_postcodes_by_principal_rollup.csv`** (with each principal's
full-vs-part split). Top 25 by part-case volume:

| # | Principal | Name | Part cases | Full cases | % part | Top district |
|---|---|---|---|---|---|---|
| 1 | RJS | Robert James Solicitors | 1071 | 598 | 64.2 | LU1(285) |
| 2 | QCL | QCL (QCL) | 863 | 244 | 78.0 | M12(814) |
| 3 | SS | Savas & Savage | 640 | 415 | 60.7 | CH65(495) |
| 4 | GG | Graham Coffey (GGP) | 521 | 785 | 39.9 | B70(185) |
| 5 | OAK | Oakwoods Solicitors | 513 | 223 | 69.7 | ML5(48) |
| 6 | FW | Fairway Solicitors | 511 | 197 | 72.2 | B5(355) |
| 7 | DFD | DFD (Richard or Joshua) Al | 432 | 541 | 44.4 | CH41(231) |
| 8 | MP | Montreal Prestige | 411 | 260 | 61.3 | BL3(195) |
| 9 | BLACK | BlackStone | 314 | 126 | 71.4 | B6(193) |
| 10 | KBS | Knightsbridge (KBS) | 209 | 154 | 57.6 | B9(70) |
| 11 | FA | Fort Assist Digbeth Court  | 132 | 82 | 61.7 | B12(68) |
| 12 | HTU | HTU Assessors Ltd | 114 | 8 | 93.4 | DE23(101) |
| 13 | ACSP | Accident Specialists (Dire | 108 | 70 | 60.7 | RH10(78) |
| 14 | SWAN | Swan | 96 | 37 | 72.2 | LU1(46) |
| 15 | YML | YM Law/ NETWORK HD UK | 87 | 45 | 65.9 | CH5(51) |
| 16 | KMR | KMR | 79 | 19 | 80.6 | M1(57) |
| 17 | SWADE | Swade Soloutions Ltd | 74 | 6 | 92.5 | OL2(65) |
| 18 | AVI | Avisons Solicitors | 72 | 54 | 57.1 | B70(16) |
| 19 | MBH | MBH Solicitors | 69 | 12 | 85.2 | M19(65) |
| 20 | AMS | AMS Solicitors | 63 | 20 | 75.9 | OL2(31) |
| 21 | TL | Trident Lloyd | 55 | 197 | 21.8 | G41(55) |
| 22 | BC | Baker Coleman | 49 | 33 | 59.8 | HD2(16) |
| 23 | KERR | Kerr Brown Partnership | 40 | 14 | 74.1 | KA8(8) |
| 24 | FOCUS | Focus UK One Ltd | 40 | 7 | 85.1 | OL1(35) |
| 25 | ALL | Alliance &Cooper | 38 | 13 | 74.5 | M8(4) |

> How to use: take the top rows of table A, map each `(principal, district)` to the
> real full address you know, and feed those back as known sites — they will convert
> the largest blocks of district-only cases to full locations first.

---

## Q2 — Locations used by MULTIPLE principals

A location used by several principals is a **shared site** — almost always a storage/
recovery yard or an image-sourcing hub — which is exactly why the location alone can't
identify the work provider. Two views.

### A. Exact location (full postcode or part district) shared by >1 principal
Full data: **`loc_locations_multi_principal.csv`**. Top 25 by number of principals:

| # | Location | Type | #Principals | Cases | Principals (top) |
|---|---|---|---|---|---|
| 1 | OL2 | part | 28 | 362 | Graham Coffey (GGP):113; Swade Soloutions Ltd:65; AMS Solicitors:31; Sky Seventy Ltd:13; Elite Five Ltd:13; Prestige Oldham Ltd:12; (+22 more) |
| 2 | OL1 | part | 27 | 241 | Focus UK One Ltd:35; Express UK One Ltd:31; Vogue Plus Ltd:26; Whiteline:24; Sky Seventy Ltd:19; Graham Coffey (GGP):18; (+21 more) |
| 3 | B6 | part | 12 | 218 | BlackStone:193; Proactive Hybrid Corporate Ltd:7; Samore Traders Ltd:5; Montreal Prestige:3; Robert James Solicitors:3; Muhammed Touray:1; (+6 more) |
| 4 | CH46 4TP | full | 11 | 867 | DFD (Richard or Joshua) Also Car Claims:333; Havard Law Solicitors:320; Matrix Solicitors Station Approach Pasture:114; Williams & Co:30; Burdward Solicitors:23; Hattons Solicitors Prudential Buildings:22; (+5 more) |
| 5 | M12 | part | 11 | 839 | QCL (QCL):814; LEX Solicitors:16; Fairway Solicitors:1; Hackney Solutions:1; Taylor Price:1; Alliance &Cooper:1; (+5 more) |
| 6 | B70 | part | 11 | 221 | Graham Coffey (GGP):185; Avisons Solicitors:16; Knightsbridge (KBS):4; Absolute Law Solicitors Unity House:4; Resolve Solicitors:3; BlackStone:2; (+5 more) |
| 7 | LU4 | part | 11 | 114 | Robert James Solicitors:88; Swan:13; Claim Specialists:3; Alliance &Cooper:2; Motor Class Hire:2; Motor X Assistance Ltd:1; (+5 more) |
| 8 | B12 | part | 10 | 181 | Robert James Solicitors:95; Fort Assist Digbeth Court Business:68; Avisons Solicitors:11; BlackStone:1; Alliance &Cooper:1; Knightsbridge (KBS):1; (+4 more) |
| 9 | B9 | part | 10 | 95 | Knightsbridge (KBS):70; Aman Solicitors Advocates:8; Fairway Solicitors:6; Fort Assist Digbeth Court Business:4; Robert James Solicitors:2; Parkers Solicitors:1; (+4 more) |
| 10 | LU3 | part | 10 | 84 | Robert James Solicitors:38; Collision Haus:16; R1am:12; Swan:9; Motor Class Hire:3; Motorcade Collision Assist Suite:2; (+4 more) |
| 11 | B10 | part | 9 | 78 | Knightsbridge (KBS):37; Fairway Solicitors:20; Robert James Solicitors:7; BlackStone:5; Aman Solicitors Advocates:3; Resolve Solicitors:2; (+3 more) |
| 12 | LU2 | part | 9 | 16 | Robert James Solicitors:7; Swan:2; Motor X Assistance Ltd:1; Stallion:1; AMS Solicitors:1; Graham Coffey (GGP):1; (+3 more) |
| 13 | B33 | part | 9 | 13 | Fort Assist Digbeth Court Business:3; Robert James Solicitors:3; AMS Solicitors:1; BlackStone:1; Knightsbridge (KBS):1; Marsdens Solicitors:1; (+3 more) |
| 14 | LU1 | part | 8 | 379 | Robert James Solicitors:285; Swan:46; R1am:18; Motor Class Hire:16; Claim Specialists:6; Motor X Assistance Ltd:5; (+2 more) |
| 15 | BL3 | part | 8 | 202 | Montreal Prestige:195; Alliance &Cooper:1; Fairway Solicitors:1; QCL (QCL):1; Umar Chadat:1; Graham Coffey (GGP):1; (+2 more) |
| 16 | M19 | part | 8 | 117 | MBH Solicitors:65; DFD (Richard or Joshua) Also Car Claims:24; Graham Coffey (GGP):19; QCL (QCL):5; Apexx Ltd:1; Knightsbridge (KBS):1; (+2 more) |
| 17 | LE2 | part | 8 | 12 | Graham Coffey (GGP):5; Montreal Prestige:1; Fairway Solicitors:1; BlackStone:1; Fort Assist Digbeth Court Business:1; Robert James Solicitors:1; (+2 more) |
| 18 | IG11 | part | 8 | 8 | Swan:1; Motor X Assistance Ltd:1; Matt Rowland Solicitors:1; Montreal Prestige:1; BlackStone:1; Monaco Motor Group Limited Unit:1; (+2 more) |
| 19 | OL1 3QR | full | 7 | 25 | Focus UK One Ltd:6; Whiteline:5; Sky Seventy Ltd:4; Express UK One Ltd:3; Vogue Plus Ltd:3; AMS Solicitors:3; (+1 more) |
| 20 | B25 | part | 7 | 19 | BlackStone:11; Knightsbridge (KBS):3; Zenith Lawyers:1; Fort Assist Digbeth Court Business:1; Fairway Solicitors:1; Robert James Solicitors:1; (+1 more) |
| 21 | B11 | part | 7 | 18 | Fort Assist Digbeth Court Business:5; Robert James Solicitors:5; Fairway Solicitors:3; BlackStone:2; Woodlands:1; Mahmed Umar:1; (+1 more) |
| 22 | B8 | part | 7 | 16 | BlackStone:4; Fort Assist Digbeth Court Business:3; Robert James Solicitors:3; Aman Solicitors Advocates:3; Swan:1; Alliance &Cooper:1; (+1 more) |
| 23 | BD3 | part | 7 | 10 | BlackStone:3; Graham Coffey (GGP):2; Abrahams Solicitors:1; Matrix Solicitors Station Approach Pasture:1; Alison Law:1; Zenith Lawyers:1; (+1 more) |
| 24 | UB6 | part | 7 | 8 | Saci Gabour:2; Graham Coffey (GGP):1; Ainuddin Khalil:1; Flat:1; Elsir Ahmed Tagelsir:1; Qorane Mohamed ELMI:1; (+1 more) |
| 25 | B5 | part | 6 | 389 | Fairway Solicitors:355; BlackStone:26; Parkers Solicitors:4; Six Ways Marketing Ltd:2; Parkers Solicitors Ltd:1; Robert James Solicitors:1 |

### B. District-level overlap (full + part merged by outward code)
Full data: **`loc_districts_multi_principal.csv`**. Top 25 by number of principals:

| # | District | #Principals | Cases | full/part | Principals (top) |
|---|---|---|---|---|---|
| 1 | OL2 | 29 | 391 | 29/362 | Graham Coffey (GGP):136; Swade Soloutions Ltd:67; AMS Solicitors:31; Sky Seventy Ltd:13; Prestige Oldham Ltd:13; Elite Five Ltd:13; (+23 more) |
| 2 | OL1 | 29 | 328 | 87/241 | Graham Coffey (GGP):62; Focus UK One Ltd:42; Express UK One Ltd:34; Whiteline:29; Vogue Plus Ltd:29; AMS Solicitors:28; (+23 more) |
| 3 | M12 | 14 | 1024 | 185/839 | QCL (QCL):976; LEX Solicitors:30; Graham Coffey (GGP):5; Taylor Price:2; Zen Law Solicitors Virginia House:2; Fairway Solicitors:1; (+8 more) |
| 4 | CH46 | 14 | 991 | 881/110 | DFD (Richard or Joshua) Also Car Claims:444; Havard Law Solicitors:320; Matrix Solicitors Station Approach Pasture:122; Williams & Co:30; Burdward Solicitors:24; Hattons Solicitors Prudential Buildings:22; (+8 more) |
| 5 | B6 | 13 | 302 | 84/218 | BlackStone:268; Robert James Solicitors:8; Proactive Hybrid Corporate Ltd:7; Samore Traders Ltd:5; Montreal Prestige:3; QCL (QCL):2; (+7 more) |
| 6 | B8 | 13 | 33 | 17/16 | BlackStone:7; Robert James Solicitors:6; Fort Assist Digbeth Court Business:5; Aman Solicitors Advocates:4; Graham Coffey (GGP):2; ASL Boston Solicitors:2; (+7 more) |
| 7 | CH41 | 12 | 334 | 97/237 | DFD (Richard or Joshua) Also Car Claims:312; Matrix Solicitors Station Approach Pasture:5; Havard Law Solicitors:4; Savas & Savage:3; Wirral Car Solutions Unit:2; Burdward Solicitors:2; (+6 more) |
| 8 | B70 | 12 | 324 | 103/221 | Graham Coffey (GGP):275; Avisons Solicitors:18; Knightsbridge (KBS):7; Absolute Law Solicitors Unity House:7; Resolve Solicitors:3; .:3; (+6 more) |
| 9 | B9 | 12 | 183 | 88/95 | Knightsbridge (KBS):135; Aman Solicitors Advocates:16; Robert James Solicitors:9; Fairway Solicitors:8; Fort Assist Digbeth Court Business:7; Avisons Solicitors:2; (+6 more) |
| 10 | LU3 | 12 | 128 | 44/84 | Robert James Solicitors:48; R1am:27; Collision Haus:23; Swan:9; Motor Class Hire:8; Graham Coffey (GGP):5; (+6 more) |
| 11 | CH44 | 12 | 36 | 23/13 | Havard Law Solicitors:9; DFD (Richard or Joshua) Also Car Claims:8; Matrix Solicitors Station Approach Pasture:4; Burdward Solicitors:4; The Bodyshop:3; Savas & Savage:2; (+6 more) |
| 12 | B33 | 12 | 27 | 14/13 | Robert James Solicitors:7; Fort Assist Digbeth Court Business:5; Knightsbridge (KBS):3; Graham Coffey (GGP):3; Aman Solicitors Advocates:2; AMS Solicitors:1; (+6 more) |
| 13 | B66 | 12 | 23 | 18/5 | Knightsbridge (KBS):5; Fort Assist Digbeth Court Business:5; Graham Coffey (GGP):3; Robert James Solicitors:2; BlackStone:1; Woodlands:1; (+6 more) |
| 14 | LU4 | 11 | 172 | 58/114 | Robert James Solicitors:131; Swan:18; DFD (Richard or Joshua) Also Car Claims:5; Claim Specialists:4; Accident Specialists (Direct jobs):4; Motor Class Hire:4; (+5 more) |
| 15 | M19 | 11 | 156 | 39/117 | MBH Solicitors:74; DFD (Richard or Joshua) Also Car Claims:38; Graham Coffey (GGP):25; QCL (QCL):8; Mellor Solicitors Post Office Building:5; Apexx Ltd:1; (+5 more) |
| 16 | B10 | 11 | 128 | 50/78 | Knightsbridge (KBS):55; Fairway Solicitors:31; Robert James Solicitors:11; BlackStone:8; Avisons Solicitors:5; Easthams Solicitors Ltd:5; (+5 more) |
| 17 | B19 | 11 | 33 | 14/19 | Robert James Solicitors:8; Fairway Solicitors:5; BlackStone:4; Aman Solicitors Advocates:4; Avisons Solicitors:3; Graham Coffey (GGP):3; (+5 more) |
| 18 | LU1 | 10 | 525 | 146/379 | Robert James Solicitors:362; Swan:64; R1am:40; Motor Class Hire:35; Motor X Assistance Ltd:11; Claim Specialists:6; (+4 more) |
| 19 | B12 | 10 | 329 | 148/181 | Robert James Solicitors:187; Fort Assist Digbeth Court Business:110; Avisons Solicitors:22; Fairway Solicitors:3; Marsdens Solicitors:2; BlackStone:1; (+4 more) |
| 20 | B11 | 10 | 35 | 17/18 | Fort Assist Digbeth Court Business:9; Robert James Solicitors:9; Fairway Solicitors:5; BlackStone:4; Woodlands:3; Mahmed Umar:1; (+4 more) |
| 21 | B25 | 10 | 31 | 12/19 | BlackStone:17; Knightsbridge (KBS):3; Zenith Lawyers:3; Avisons Solicitors:2; Fort Assist Digbeth Court Business:1; Fairway Solicitors:1; (+4 more) |
| 22 | IG11 | 10 | 13 | 5/8 | ASL Boston Solicitors:4; Swan:1; Motor X Assistance Ltd:1; Matt Rowland Solicitors:1; Montreal Prestige:1; BlackStone:1; (+4 more) |
| 23 | RH10 | 9 | 493 | 172/321 | Robert James Solicitors:350; Accident Specialists (Direct jobs):130; Swan:7; Shamssa Ali:1; Mohamed Raache:1; Muahmmad Akram:1; (+3 more) |
| 24 | IG1 | 9 | 33 | 27/6 | Graham Coffey (GGP):16; Easthams Solicitors Ltd:6; Robert James Solicitors:3; FAO The Court C/o:3; Swan:1; Fairway Solicitors:1; (+3 more) |
| 25 | NW9 | 9 | 24 | 12/12 | Graham Coffey (GGP):14; DFD (Richard or Joshua) Also Car Claims:2; Easthams Solicitors Ltd:2; Sabiha Alibhai:1; Zain Khayat:1; Fort Assist Digbeth Court Business:1; (+3 more) |

> Reading it: the multi-principal full postcodes (e.g. storage yards) are the sites to
> register once in `Repairer`/`ImageSource` and link to all the principals that use
> them. The district view shows the broader catchment overlap (useful for the
> address-matching service and for spotting yards that appear as both full and part).

---

### Method & caveats
- Loc parsed with the shared UK-postcode parser: **full** = complete unit
  (`OL1 3QR`); **part** = outward district only (`CH5`). Non-postcode Loc text and
  empty Loc are excluded.
- Counts are case occurrences in `everyrepairloc.xlsx`. Principal names are resolved
  from the EVA contact/job-sheet sources (firm derived from address where the EVA
  name is the "FAO The Court" placeholder).
- A shared *full postcode* is a genuine single site; a shared *district* may span
  several nearby addresses — treat the district view as catchment, not one building.
