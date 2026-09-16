"use client";

import QRCode from "qrcode";
import Image from "next/image";
import { FormEvent, useMemo, useState } from "react";

const MAX_PER_QR = 1999 * 100;
const MAX_CODES = 100;
const MAX_TOTAL = MAX_CODES * MAX_PER_QR;

type PaymentCode = {
  amount: number;
  uri: string;
  image: string;
  received: boolean;
};

type Collection = {
  payeeName: string;
  upiId: string;
  note: string;
  total: number;
  payments: PaymentCode[];
};

function parseAmount(value: string): number {
  const normalized = value.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Enter an amount with no more than two decimal places.");
  }

  const [rupees, fraction = ""] = normalized.split(".");
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(paise) || paise < 1) {
    throw new Error("Enter an amount greater than ₹0.");
  }
  if (paise > MAX_TOTAL) {
    throw new Error("The maximum collection is ₹1,99,900 (up to 100 codes).");
  }
  return paise;
}

function splitAmount(total: number) {
  const parts: number[] = [];
  for (let remaining = total; remaining > 0; remaining -= MAX_PER_QR) {
    parts.push(Math.min(remaining, MAX_PER_QR));
  }
  return parts;
}

function formatRupees(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

function paymentUri(
  upiId: string,
  payeeName: string,
  amount: number,
  note: string,
  reference: string,
) {
  const params = new URLSearchParams({
    pa: upiId,
    pn: payeeName,
    am: (amount / 100).toFixed(2),
    cu: "INR",
    tr: reference,
  });
  if (note) params.set("tn", note);
  return `upi://pay?${params.toString()}`;
}

export default function Home() {
  const [upiId, setUpiId] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [note, setNote] = useState("");
  const [collection, setCollection] = useState<Collection | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const previewParts = useMemo(() => {
    try {
      return splitAmount(parseAmount(amountInput));
    } catch {
      return [];
    }
  }, [amountInput]);

  async function generateCodes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setCollection(null);

    const normalizedUpi = upiId.trim();
    const normalizedName = payeeName.trim();
    const normalizedNote = note.trim();

    if (!/^[^\s@]{1,100}@[^\s@]{1,100}$/.test(normalizedUpi)) {
      setError("Enter a valid UPI ID, such as name@bank.");
      return;
    }
    if (!normalizedName || normalizedName.length > 100) {
      setError("Enter the account holder’s name (up to 100 characters).");
      return;
    }
    if (normalizedNote.length > 80) {
      setError("Keep the payment note to 80 characters or fewer.");
      return;
    }

    let total: number;
    try {
      total = parseAmount(amountInput);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Check the amount and try again.");
      return;
    }

    setBusy(true);
    try {
      const reference = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
      const payments = await Promise.all(
        splitAmount(total).map(async (part, index) => {
          const uri = paymentUri(
            normalizedUpi,
            normalizedName,
            part,
            normalizedNote,
            `${reference}${index + 1}`,
          );
          const image = await QRCode.toDataURL(uri, {
            width: 360,
            margin: 3,
            errorCorrectionLevel: "M",
            color: { dark: "#172b20", light: "#ffffff" },
          });
          return { amount: part, uri, image, received: false };
        }),
      );
      setCollection({
        payeeName: normalizedName,
        upiId: normalizedUpi,
        note: normalizedNote,
        total,
        payments,
      });
    } catch {
      setError("Couldn’t make the QR codes. Check your details and try again.");
    } finally {
      setBusy(false);
    }
  }

  function updateReceived(index: number, received: boolean) {
    setCollection((current) =>
      current
        ? {
            ...current,
            payments: current.payments.map((payment, paymentIndex) =>
              paymentIndex === index ? { ...payment, received } : payment,
            ),
          }
        : current,
    );
  }

  async function copyUpiId() {
    if (!collection) return;
    try {
      await navigator.clipboard.writeText(collection.upiId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Clipboard access is unavailable. You can select and copy the UPI ID instead.");
    }
  }

  function resetTool() {
    setCollection(null);
    setUpiId("");
    setPayeeName("");
    setAmountInput("");
    setNote("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const receivedTotal = collection?.payments.reduce(
    (total, payment) => total + (payment.received ? payment.amount : 0),
    0,
  );

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="1triple9 Club home">
          <span className="wordmark-symbol">1</span>
          <span>1triple9 Club</span>
        </a>
        <nav className="topnav" aria-label="Main navigation">
          <a className="nav-link nav-link-active" href="#tool">The tool</a>
          <a className="nav-link" href="#how-it-works">Fee guide</a>
        </nav>
        <span className="topbar-note"><span className="local-dot" /> Runs in your browser</span>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="hero-kicker">A tiny tool for a very big bill</p>
          <h1>Payment ka breakup<br /><span>kar do.</span></h1>
          <p className="hero-description">
            Split a collection into UPI QR codes of ₹1,999 or less. Your details stay on this device.
          </p>
          <a className="hero-cta" href="#tool">Make your QR codes <span aria-hidden="true">↓</span></a>
        </div>
        <div className="hero-art" aria-label="Illustration of one larger payment split into smaller QR payments">
          <div className="art-sticker">SPLIT HAPPENS</div>
          <div className="art-total"><span>ONE BIG TOTAL</span><strong>₹9,450</strong></div>
          <div className="art-equals" aria-hidden="true">↘</div>
          <div className="art-receipts">
            <div className="receipt receipt-one"><div className="receipt-qr"><i /><i /><i /><i /><i /><i /><i /><i /><i /></div><strong>₹1,999</strong><span>SCAN TO PAY</span></div>
            <div className="receipt receipt-two"><div className="receipt-qr"><i /><i /><i /><i /><i /><i /><i /><i /><i /></div><strong>₹1,999</strong><span>SCAN TO PAY</span></div>
            <div className="receipt receipt-three"><div className="receipt-qr"><i /><i /><i /><i /><i /><i /><i /><i /><i /></div><strong>₹1,999</strong><span>SCAN TO PAY</span></div>
            <div className="receipt receipt-four"><div className="receipt-qr"><i /><i /><i /><i /><i /><i /><i /><i /><i /></div><strong>₹1,999</strong><span>SCAN TO PAY</span></div>
            <div className="receipt receipt-last"><span className="last-plus">+</span><strong>₹1,454</strong><span>THE LAST BIT</span></div>
          </div>
          <p className="art-caption">Same UPI ID. A handful of separate payments.</p>
        </div>
      </section>

      <section className="tool-section" id="tool" aria-labelledby="tool-heading">
        <div className="section-heading">
          <div><p className="section-kicker">The actual useful bit</p><h2 id="tool-heading">Make a collection</h2></div>
          <p>Three details in. Ready-to-scan codes out.</p>
        </div>

        <div className="tool-layout">
          <form className="form-panel" onSubmit={generateCodes}>
            <div className="panel-topline"><span>COLLECTION DETAILS</span><span>01—04</span></div>
            <div className="field-group">
              <label htmlFor="upi">Your UPI ID</label>
              <input id="upi" value={upiId} onChange={(event) => setUpiId(event.target.value)} placeholder="name@bank" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={201} required />
              <span className="field-hint">Payments go straight to this ID.</span>
            </div>
            <div className="field-group">
              <label htmlFor="payee">Account holder name</label>
              <input id="payee" value={payeeName} onChange={(event) => setPayeeName(event.target.value)} placeholder="Name shown in your UPI app" autoComplete="name" maxLength={100} required />
            </div>
            <div className="field-group amount-field">
              <label htmlFor="amount">Total amount to collect</label>
              <div className="money-input"><span aria-hidden="true">₹</span><input id="amount" value={amountInput} onChange={(event) => setAmountInput(event.target.value)} placeholder="0.00" inputMode="decimal" maxLength={12} aria-describedby="amount-hint" required /><span className="currency-label">INR</span></div>
              <span className="field-hint" id="amount-hint">Up to ₹1,99,900 · maximum 100 codes</span>
            </div>
            <div className="field-group note-field">
              <label htmlFor="note">Payment note <span>OPTIONAL</span></label>
              <input id="note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Invoice, occasion, running joke…" maxLength={80} />
            </div>

            <div className="split-preview" aria-live="polite">
              <span>{previewParts.length ? `SPLIT INTO ${previewParts.length} ${previewParts.length === 1 ? "PAYMENT" : "PAYMENTS"}` : "YOUR PAYMENT PLAN"}</span>
              <div className="split-chips">
                {previewParts.slice(0, 5).map((part, index) => <span key={index}>{formatRupees(part)}</span>)}
                {previewParts.length > 5 && <span>+{previewParts.length - 5}</span>}
                {!previewParts.length && <span>Enter an amount to see the split</span>}
              </div>
            </div>

            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="generate-button" type="submit" disabled={busy}>
              {busy ? "Making your codes…" : collection ? "Make a new collection" : "Generate UPI QR codes"}
              <span aria-hidden="true">↗</span>
            </button>
            <p className="privacy-note">Your UPI details never leave this browser.</p>
          </form>

          <section className="results-panel" aria-labelledby="results-heading" aria-live="polite" aria-busy={busy}>
            <div className="results-topline"><h3 id="results-heading">Your QR codes</h3>{collection && <button className="text-button" type="button" onClick={() => window.print()}>Print all</button>}</div>
            {collection ? (
              <>
                <div className="collection-summary">
                  <div><span>COLLECTING</span><strong>{formatRupees(collection.total)}</strong></div>
                  <div><span>RECEIVED <span className="summary-fraction">{collection.payments.filter((payment) => payment.received).length}/{collection.payments.length}</span></span><strong>{formatRupees(receivedTotal ?? 0)}</strong></div>
                </div>
                <div className="payee-row"><div><strong>{collection.payeeName}</strong><span>{collection.upiId}</span></div><button className="copy-button" type="button" onClick={copyUpiId}>{copied ? "Copied" : "Copy ID"}</button></div>
                <div className="qr-list">
                  {collection.payments.map((payment, index) => (
                    <article className={`payment-card${payment.received ? " payment-card-received" : ""}`} key={payment.uri}>
                      <div className="payment-number">{String(index + 1).padStart(2, "0")}</div>
                      <Image src={payment.image} alt={`UPI QR code for ${formatRupees(payment.amount)} to ${collection.payeeName}`} width={120} height={120} unoptimized />
                      <div className="payment-info"><span>PAYMENT {index + 1} OF {collection.payments.length}</span><strong>{formatRupees(payment.amount)}</strong><a className="pay-link" href={payment.uri}>Open UPI app <span aria-hidden="true">↗</span></a></div>
                      <div className="payment-actions"><a className="download-link" href={payment.image} download={`1triple9-club-payment-${index + 1}-${(payment.amount / 100).toFixed(2)}.png`}>Download</a><label className="received-check"><input type="checkbox" checked={payment.received} onChange={(event) => updateReceived(index, event.target.checked)} /><span>{payment.received ? "Received" : "Mark received"}</span></label></div>
                    </article>
                  ))}
                </div>
                <div className="receipt-note"><strong>Check your bank app after each scan.</strong> The received tally is a manual reminder; this page cannot verify payments or notify you when money arrives.</div>
                <div className="collection-footer"><span>QRs are made on this device only.</span><button type="button" className="text-button" onClick={resetTool}>Start over</button></div>
              </>
            ) : (
              <div className="empty-results">
                <div className="empty-receipt"><div className="empty-qr"><i /><i /><i /><i /><i /><i /><i /><i /><i /></div><div><span>PAYMENT 01</span><strong>₹1,999</strong><span>YOUR UPI ID</span></div></div>
                <p>Your codes will show up here</p>
                <span>Each one is a separate UPI payment, ready to download or print.</span>
                <div className="empty-rule"><span>NO APP INSTALL</span><span>NO SIGN-UP</span><span>NO SERVER UPLOADS</span></div>
              </div>
            )}
          </section>
        </div>
      </section>

      <section className="fee-section" id="how-it-works">
        <div className="fee-heading"><p className="section-kicker">Quick reality check</p><h2>A fee rule is not<br />a tax rule.</h2></div>
        <div className="fee-copy"><p>As announced for 15 October 2026, select merchant payments above ₹2,000 may carry MDR paid by the merchant. Personal transfers and payments at or below ₹2,000 remain free under the framework; eligible small merchants have a separate exemption.</p><p>Splitting one purchase into smaller QR payments does <strong>not</strong> guarantee that your bank or payment provider will treat it as exempt. Check their terms. This little tool generates codes; it cannot check your merchant category or confirm a payment.</p><a href="https://www.pib.gov.in/PressReleasePage.aspx?PRID=2310586" target="_blank" rel="noreferrer">Read the Finance Ministry’s announcement <span aria-hidden="true">↗</span></a></div>
      </section>

      <footer className="site-footer"><a className="wordmark footer-brand" href="#top"><span className="wordmark-symbol">1</span><span>1triple9 Club</span></a><span>Built for collecting. Not for legal advice.</span><a href="#tool">Back to the tool ↑</a></footer>
    </main>
  );
}
