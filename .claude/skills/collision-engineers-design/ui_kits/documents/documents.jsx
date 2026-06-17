/* Collision Engineers — the documents themselves (faithful to supplied PDFs) */

/* ============ 1 · TOTAL LOSS REPORT (FH70PKY) ============ */
function TotalLossReport() {
  const meta = { ourRef: "fh70 pky", yourRef: "FH70 PKY", date: "07/05/2026" };
  return (
    <div className="sheet">
      <div className="sheet-body">
        <Letterhead {...meta} />
        <p className="fao">FAO The Court<br /><span className="addr">C/O JM Vehicle Resolutions</span></p>
        <DocTitle underlined>Total Loss Report</DocTitle>
        <p className="salutation">Dear Sirs</p>
        <p className="re-line">RE: Road Traffic Accident: <span className="rest">Daniel Kelly — 04/05/2026</span></p>
        <p className="doc-p">In accordance with your instructions received on 07/05/2026 requesting us to provide an independent accident damage report, we assessed the damage on 07/05/2026. Vehicle located at image-based assessment. Our findings are as detailed below:</p>
        <DataTable rows={[
          ["Make", "FORD", "Registration", "FH70PKY"],
          ["Model", "TRANSIT CUSTOM 280", "Status", "T/Loss"],
          ["Category", "N", "Salvage Value", "£1,306.00"],
          ["Repair Cost", "£12,979.67", "Legal Status", "Unroadworthy"],
          ["Engineer Value", "£13,061.00", "Impact Magnitude", "Moderate to Heavy"],
        ]} />
        <div className="media-row">
          <MediaPlaceholder title="Vehicle" note="Case inspection photograph inserted per report" icon="car" />
          <MediaPlaceholder title="Impact Area" note="Branded top-down impact diagram inserted per report" icon="image" />
        </div>
        <SectionHeading>Nature of Incident</SectionHeading>
        <p className="doc-p">The vehicle has suffered moderate to heavy collision/impact damage to the right hand side.</p>
        <SectionHeading>Engineer's Comments</SectionHeading>
        <p className="doc-p">Mileage estimated by Percayso. Please note the vehicle is unroadworthy due to the extent of panel distortion sustained to the offside.</p>
        <SectionHeading>Settlement</SectionHeading>
        <p className="doc-p">We consider that an equitable settlement would be £11,755.00 which represents the pre-accident engineer value of the vehicle of £13,061.00 less the value of the salvage of £1,306.00.</p>
      </div>
      <DocFooter page={1} total={16} />
    </div>
  );
}

/* ============ 2 · MARKET VALUATION EVIDENCE (KF06 UJB) ============ */
function ValuationEvidence() {
  const meta = { ourRef: "KF06 UJB", yourRef: "SCL/45018/1", date: "20/05/2026" };
  return (
    <div className="sheet">
      <div className="sheet-body">
        <Letterhead {...meta} />
        <DocTitle underlined>Market Valuation Evidence</DocTitle>
        <p className="re-line">RE: <span className="rest">Vauxhall Vectra SRi Nav — Registration KF06 UJB</span></p>
        <p className="doc-p">We have undertaken a review of comparable vehicles currently advertised in the retail market, having regard to make, model, age, mileage, engine, transmission, specification and general condition.</p>
        <SectionHeading>Subject Vehicle Details</SectionHeading>
        <KVTable rows={[
          ["Registration", "KF06 UJB", "Make / Model", "Vauxhall Vectra SRi Nav"],
          ["Body Type", "5 door hatchback", "Fuel / Trans.", "Petrol / Manual"],
          ["Engine", "1796cc / 140 BHP", "First Reg.", "March 2006"],
          ["Mileage", "140,000 miles", "Colour", "Blue"],
          ["History", "No adverse history", "VIN", "W0L0ZCF681076870"],
        ]} />
        <SectionHeading>Assessed Retail Market Value</SectionHeading>
        <ValueCallout label="Engineer's assessed retail value" value="£1,200.00" />
        <SectionHeading>Market Research</SectionHeading>
        <p className="doc-p">The market search identified a limited number of directly comparable Vauxhall Vectra SRi petrol manual hatchback examples. The selected examples below are considered the most relevant identified from the search results.</p>
        <table className="evi-table">
          <thead><tr><th>No.</th><th>Vehicle / Derivative</th><th>Year</th><th className="num">Mileage</th><th className="num">Asking</th><th>Comment</th></tr></thead>
          <tbody>
            <tr><td>1</td><td>Vauxhall Vectra 1.8 VVT SRi 5dr</td><td>2006</td><td className="num">112,000</td><td className="num">£1,000</td><td>Closest match by age, engine, trim, body style and transmission.</td></tr>
            <tr><td>2</td><td>Vauxhall Vectra 1.8 VVT SRi 5dr</td><td>2008</td><td className="num">135,900</td><td className="num">£915</td><td>Comparable mileage and specification; newer than subject.</td></tr>
            <tr><td>3</td><td>Vauxhall Vectra 1.8 VVT SRi 5dr</td><td>2007</td><td className="num">134,000</td><td className="num">£2,290</td><td>Similar mileage and specification; enhanced styling noted.</td></tr>
            <tr><td>4</td><td>Vauxhall Vectra 1.8 VVT SRi 5dr</td><td>2008</td><td className="num">103,000</td><td className="num">£2,495</td><td>Lower mileage and newer; useful wider market support.</td></tr>
          </tbody>
        </table>
        <SectionHeading>Conclusion</SectionHeading>
        <p className="doc-p">Following detailed market research and review of comparable live adverts, we consider a retail pre-accident market value of £1,200.00 to be reasonable for the subject vehicle.</p>
        <SignatureBlock who="neil" />
      </div>
      <DocFooter page={1} total={1} />
    </div>
  );
}

/* ============ 4 · DIMINUTION REBUTTAL (dr.pdf) ============ */
function DiminutionRebuttal() {
  const meta = { ourRef: "a.qdos251848", yourRef: "LR/ND/40354/1", date: "5th May 2026" };
  return (
    <div className="sheet">
      <div className="sheet-body">
        <Letterhead {...meta} />
        <DocTitle underlined>Rebuttal of Claim for Diminution in Value</DocTitle>
        <p className="salutation">FAO: The Instructing Solicitor</p>
        <p className="doc-p">We have been instructed to comment upon a Vehicle Diminution in Value Assessment prepared by Exclusive Vehicle Assessors (“EVA”). Having reviewed it, it is our professional opinion that the claim for diminution in value should be rejected. There is no evidence that the vehicle has suffered any actual, detectable or permanent loss of value, and the figure put forward has been produced by a methodology that is unreliable for the reasons set out below.</p>
        <SectionHeading>The Damage and Repairs Were Superficial</SectionHeading>
        <Bullets items={[
          "The damage in this case, and the repairs carried out to address it, were superficial and cosmetic in nature.",
          "The work was confined to outer, bolt-on panels and their refinishing – items such as bumpers, wings, doors, mirrors and trim – together with the associated painting and minor sundries. It did not involve any structural, welded or bonded component, nor the suspension, steering, chassis, or any airbag or safety-restraint system.",
          "The vehicle's structural integrity was never compromised. The repair restored cosmetic appearance; it did not address – because it did not need to address – anything fundamental to the soundness or safety of the vehicle.",
          "Superficial repair of this kind is commonplace on used vehicles. A buyer who became aware of it would recognise it for what it is, and would not treat cosmetic work of this nature as materially affecting the value of the vehicle.",
        ]} />
        <SectionHeading>No Physical Inspection of the Vehicle</SectionHeading>
        <Bullets items={[
          "EVA's diminution assessment is a desk-based exercise produced from documents alone. The vehicle is not inspected.",
          "No paint-depth readings are taken across the repaired and adjacent panels, which would establish whether the refinish is within OEM tolerance and whether it is detectable at all.",
          "No panel-gap or alignment measurements are taken to establish whether fit and finish meets manufacturer specification.",
          "No colour-match assessment is carried out in daylight, and no inspection is made for overspray, blending edges or polish marks.",
          "Without any evidence that the repair is detectable, the assertion of a “permanent and measurable” loss of value is unsupported.",
        ]} />
        <SectionHeading>The Stigma Scale Is Not a Recognised Methodology</SectionHeading>
        <p className="doc-p">The graduated stigma scale applied by EVA does not correspond to any methodology endorsed by the Association of British Insurers, Thatcham, Glass's or CAP HPI. It applies a flat percentage based only on repair cost as a proportion of value, taking no account of the nature of the damage.</p>
        <SignatureBlock who="ed" />
      </div>
      <DocFooter page={1} total={3} />
    </div>
  );
}

/* ============ 3 · FEE NOTE (QCL24257-P35) ============ */
function FeeNote() {
  return (
    <div className="sheet">
      <div className="sheet-body">
        <div className="letterhead">
          <img src="../../assets/logo_no_margin.png" alt="Collision Engineers" style={{ height: 86 }} />
          <div className="fee-org">
            <strong>Collision Engineers Ltd</strong>
            Independent Automotive Experts<br />
            VAT No: 262 0937 10<br />
            Engineers@CollisionEngineers.co.uk<br />
            www.CollisionEngineers.co.uk
          </div>
        </div>
        <DocTitle red>Fee Note</DocTitle>
        <div className="fee-meta">
          <div className="billto">
            <div className="lab">Bill To</div>
            Keoghs LLP<br />2 The Parklands<br />Lostock<br />Bolton<br />BL6 4SE
          </div>
          <div>
            <div className="rows">
              <span className="k">Invoice No:</span><span>QCL24257-P35</span>
              <span className="k">Date:</span><span>5 May 2026</span>
              <span className="k">Our Ref:</span><span>QCL24257</span>
              <span className="k">Your Ref:</span><span>SGJ.T11398385</span>
              <span className="k">Matter:</span><span>Saqib Ali v AXA Insurance — Claim No. M07ZA197</span>
            </div>
          </div>
        </div>
        <table className="fee-table">
          <thead><tr><th>Description</th><th className="amt">Amount (£)</th></tr></thead>
          <tbody>
            <tr>
              <td><strong>Responses to Part 35 Questions</strong><br />Vehicle: Toyota Prius Plus Icon TSS — Registration FV68 KEJ<br />Written responses to Schedule of Questions to Engineer dated 23 April 2026, in relation to engineer's report dated 10 July 2024.</td>
              <td className="amt">225.00</td>
            </tr>
          </tbody>
        </table>
        <div className="fee-totals">
          <div className="r"><span>Subtotal (Net)</span><span>£225.00</span></div>
          <div className="r"><span>VAT @ 20%</span><span>£45.00</span></div>
          <div className="r total"><span>Total Due</span><span>£270.00</span></div>
        </div>
        <SectionHeading>Payment Details</SectionHeading>
        <div className="pay-grid">
          <span className="k">Account Name</span><span>Collision Engineers Ltd</span>
          <span className="k">Bank</span><span>Lloyds Bank</span>
          <span className="k">Sort Code</span><span>30-12-80</span>
          <span className="k">Account Number</span><span>50858868</span>
          <span className="k">Payment Reference</span><span>QCL24257-P35</span>
          <span className="k">Remittance Email</span><span>accounts@collisionengineers.co.uk</span>
        </div>
        <SectionHeading>Terms</SectionHeading>
        <p className="doc-p" style={{ textAlign: "left", marginBottom: 4 }}>Payment due within 30 days of invoice date. Please quote the invoice number when making payment. Thank you for your business.</p>
      </div>
      <div className="doc-footer"><span>Collision Engineers Ltd | {WEB} | VAT No: 262 0937 10</span></div>
    </div>
  );
}

/* ============ 5 · RESPONSE LETTER — canonical dispute wording (without prejudice) ============ */
function ResponseLetter() {
  const meta = { ourRef: "AB12 CDE", yourRef: "MOT/118245/3", date: "9th May 2026" };
  return (
    <div className="sheet">
      <div className="sheet-body">
        <Letterhead {...meta} />
        <p className="fao">FAO: The Claims Handler<br /><span className="addr">C/o Acromas Insurance Services</span></p>
        <p className="doc-subtitle" style={{ marginTop: 6 }}>WITHOUT PREJUDICE</p>
        <p className="re-line">RE: <span className="rest">Engineer's Report — Vauxhall Astra SRi, Registration AB12 CDE</span></p>
        <p className="salutation">Dear Sirs</p>
        <p className="doc-p">Thank you for your correspondence challenging our engineer's report and pressing for a total loss settlement. We have reviewed your comments and set out our position below.</p>
        <p className="doc-p">The Defendant insurers are liable up to the cost of replacement of the Claimant's vehicle. In this instance, the repair costs are only <strong>38%</strong> of the vehicle value, so this claim is a repairable proposition. In addition, we have agreed the repairs on a contract basis and noted the report accordingly. This means costs are fixed, and therefore the Defendant insurer is safe in the knowledge that the repair costs cannot increase.</p>
        <p className="doc-p">The Claimant's vehicle has been damaged through the negligent driving of the Defendant insurer's policyholder. It would be wholly unreasonable for the Defendant insurer to force the Claimant into a total loss settlement to fit their financial interests.</p>
        <p className="doc-p">All charges within our repair specification fall within the ABP guide to retail charges and are required to restore the vehicle to its pre-accident condition. We have not been provided with any evidence that would confirm our repair specification is excessive.</p>
        <p className="doc-p"><strong>We confirm that we have no financial interest in the settlement of this claim and see no reason to deviate from our independent report.</strong></p>
        <SignatureBlock who="andy" />
      </div>
      <DocFooter page={1} total={1} />
    </div>
  );
}

Object.assign(window, { TotalLossReport, ValuationEvidence, FeeNote, DiminutionRebuttal, ResponseLetter });
