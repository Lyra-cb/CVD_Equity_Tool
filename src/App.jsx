import { useState } from "react";

const IMD_COLORS = {
  1: '#b91c1c', 2: '#c2410c', 3: '#d97706', 4: '#ca8a04', 5: '#65a30d',
  6: '#16a34a', 7: '#0d9488', 8: '#0284c7', 9: '#4f46e5', 10: '#7c3aed'
};

const deprivationLabel = (d) =>
  d <= 3 ? 'high deprivation' : d <= 7 ? 'moderate deprivation' : 'low deprivation';

function BulletList({ items }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {items.map((b, i) => (
        <li key={i} style={{
          fontSize: '0.875rem', lineHeight: '1.7',
          padding: '0.25rem 0 0.25rem 1.25rem',
          position: 'relative', color: '#1f2937'
        }}>
          <span style={{ position: 'absolute', left: 0, color: '#9ca3af' }}>•</span>
          {b}
        </li>
      ))}
    </ul>
  );
}

function Field({ label, optional, children }) {
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <label style={{
        display: 'block', fontSize: '0.78rem',
        color: optional ? '#9ca3af' : '#6b7280',
        marginBottom: '0.25rem', fontWeight: '500'
      }}>
        {label}{optional && <span style={{ fontWeight: '400' }}> — optional</span>}
      </label>
      {children}
    </div>
  );
}

const inputCss = {
  width: '100%', padding: '0.5rem 0.75rem',
  border: '1px solid #e5e7eb', borderRadius: '8px',
  fontSize: '0.875rem', background: '#fff',
  color: '#111827', outline: 'none'
};

export default function App() {
  const [testMode, setTestMode] = useState(false);
  const [patientName, setPatientName] = useState('');
  const [postcode, setPostcode] = useState('');
  const [imdDecile, setImdDecile] = useState('1');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState('');
  const [smoker, setSmoker] = useState('');
  const [qrisk, setQrisk] = useState('');
  const [bmi, setBmi] = useState('');
  const [sbp, setSbp] = useState('');
  const [cholRatio, setCholRatio] = useState('');
  const [hba1c, setHba1c] = useState('');
  const [alcohol, setAlcohol] = useState('');
  const [activity, setActivity] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);
  const [resolvedDecile, setResolvedDecile] = useState(null);

  async function lookupIMD(pc) {
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`);
    const data = await res.json();
    if (data.status !== 200) throw new Error('Postcode not found — please check and try again.');
    if (!data.result.imd) throw new Error('IMD data not available for this postcode.');
    return Math.ceil(data.result.imd / 10);
  }

  function parseBullets(text, heading) {
    const regex = new RegExp(heading + '[:\\s]*([\\s\\S]*?)(?=\\n[A-Z ]+:|$)');
    const match = text.match(regex);
    if (!match) return [];
    return match[1].trim().split('\n')
      .map(l => l.replace(/^[-•*\d.]\s*/, '').trim())
      .filter(l => l.length > 5);
  }

  async function generate() {
    setError('');
    setResults(null);

    if (!age || !qrisk || !sex || !smoker) {
      setError('Please complete all required fields.');
      return;
    }

    let decile;
    try {
      if (testMode) {
        decile = parseInt(imdDecile);
      } else {
        if (!postcode.trim()) { setError('Please enter a postcode.'); return; }
        decile = await lookupIMD(postcode.trim());
      }
    } catch (e) {
      setError(e.message);
      return;
    }

    setResolvedDecile(decile);
    setLoading(true);

    const modifiableLines = [
      smoker === 'yes' ? '- Smoker: yes' : null,
      bmi ? `- BMI: ${bmi} kg/m²` : null,
      sbp ? `- Systolic BP: ${sbp} mmHg` : null,
      cholRatio ? `- Total:HDL cholesterol ratio: ${cholRatio}` : null,
      hba1c ? `- HbA1c: ${hba1c} mmol/mol` : null,
      alcohol ? `- Alcohol intake: ${alcohol}` : null,
      activity ? `- Physical activity level: ${activity}` : null,
    ].filter(Boolean).join('\n');

    const prompt = `You are a clinical decision support tool helping UK GPs understand cardiovascular risk in the context of social deprivation.

Patient:
- Age: ${age}, Sex: ${sex}
- QRISK3 score: ${qrisk}%
- IMD Decile: ${decile}/10 (1 = most deprived) — ${deprivationLabel(decile)}
${modifiableLines ? `\nModifiable risk factors:\n${modifiableLines}` : ''}

Respond with exactly three sections using these headings verbatim:

RISK IN CONTEXT:
- bullet
- bullet
- bullet

BARRIERS TO PATHWAY:
- bullet
- bullet
- bullet
- bullet

CONSULTATION PROMPTS:
- bullet
- bullet
- bullet
- bullet

Rules: one sentence per bullet. Focus consultation prompts on the modifiable factors listed. Reference the Inverse Care Law where clinically relevant. Plain UK clinical English. Educational support only, not diagnostic. Consider age-appropriate prescribing — for patients over 75, note that statin initiation requires individual risk-benefit discussion accounting for frailty, polypharmacy, and patient preferences rather than automatic NICE threshold application.`;

    try {
      console.log('API key present:', !!import.meta.env.VITE_ANTHROPIC_API_KEY);
      const res = await fetch('/api/v1/messages', {
        method: 'POST',
        headers: {
  'Content-Type': 'application/json',
  'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
  'anthropic-version': '2023-06-01',
  'anthropic-dangerous-direct-browser-access': 'true'
},
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      const data = await res.json();
      if (!data.content?.[0]?.text) throw new Error('Unexpected API response');
      const text = data.content[0].text;

      setResults({
        context: parseBullets(text, 'RISK IN CONTEXT'),
        barriers: parseBullets(text, 'BARRIERS TO PATHWAY'),
        prompts: parseBullets(text, 'CONSULTATION PROMPTS'),
      });
    } catch (e) {
      setError('Generation failed — please try again.');
      console.error(e);
    }

    setLoading(false);
  }

  const card = {
    background: '#fff', border: '1px solid #f3f4f6',
    borderRadius: '12px', padding: '1.25rem',
    marginBottom: '0.875rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
  };

  const sectionHead = {
    fontSize: '0.7rem', fontWeight: '600',
    color: '#9ca3af', textTransform: 'uppercase',
    letterSpacing: '0.08em', marginBottom: '0.6rem',
    paddingBottom: '0.5rem', borderBottom: '1px solid #f3f4f6'
  };

  const twoCol = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' };

  const divider = {
    fontSize: '0.78rem', fontWeight: '600',
    color: '#374151', margin: '1rem 0 0.6rem',
    paddingBottom: '0.4rem', borderBottom: '1px solid #f3f4f6'
  };

  return (
    <div style={{
      fontFamily: "'Inter', system-ui, sans-serif",
      maxWidth: '620px', margin: '0 auto',
      padding: '1.5rem 1rem', background: '#f9fafb', minHeight: '100vh'
    }}>
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{
          display: 'inline-block', fontSize: '0.7rem', fontWeight: '600',
          color: '#6d28d9', background: '#ede9fe', padding: '0.2rem 0.6rem',
          borderRadius: '99px', marginBottom: '0.5rem', letterSpacing: '0.05em'
        }}>
          EDUCATIONAL TOOL
        </div>
        <h1 style={{ fontSize: '1.15rem', fontWeight: '600', color: '#111827', margin: '0 0 0.2rem' }}>
          Deprivation-Aware CVD Risk Tool
        </h1>
        <p style={{ fontSize: '0.83rem', color: '#6b7280', margin: 0 }}>
          Equity-aware consultation support for primary care
        </p>
      </div>

      <div style={card}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          marginBottom: '1rem', fontSize: '0.83rem', color: '#6b7280'
        }}>
          <input type="checkbox" id="tm" checked={testMode}
            onChange={e => setTestMode(e.target.checked)}
            style={{ accentColor: '#6d28d9' }} />
          <label htmlFor="tm" style={{ cursor: 'pointer' }}>Use test patient</label>
        </div>

        {testMode && (
          <Field label="Test patient name">
            <input style={inputCss} value={patientName}
              onChange={e => setPatientName(e.target.value)}
              placeholder="e.g. Jane Smith" />
          </Field>
        )}

        {!testMode ? (
          <Field label="Patient postcode">
            <input style={inputCss} value={postcode}
              onChange={e => setPostcode(e.target.value)}
              placeholder="e.g. NE33 1AB" />
          </Field>
        ) : (
          <Field label="IMD Decile">
            <select style={inputCss} value={imdDecile} onChange={e => setImdDecile(e.target.value)}>
              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                <option key={n} value={n}>
                  {n} — {n === 1 ? 'most deprived' : n === 10 ? 'least deprived' : ''}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div style={divider}>Required</div>

        <div style={twoCol}>
          <Field label="Age">
            <input style={inputCss} type="number" value={age}
              onChange={e => setAge(e.target.value)} placeholder="e.g. 58" min="18" max="100" />
          </Field>
          <Field label="QRISK3 score (%)">
            <input style={inputCss} type="number" value={qrisk}
              onChange={e => setQrisk(e.target.value)} placeholder="e.g. 18.5" step="0.1" />
          </Field>
        </div>

        <div style={twoCol}>
          <Field label="Sex">
            <select style={inputCss} value={sex} onChange={e => setSex(e.target.value)}>
              <option value="">Select...</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
          </Field>
          <Field label="Smoker">
            <select style={inputCss} value={smoker} onChange={e => setSmoker(e.target.value)}>
              <option value="">Select...</option>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </Field>
        </div>

        <div style={divider}>
          Modifiable risk factors <span style={{ fontWeight: 400, color: '#9ca3af' }}>— improves output</span>
        </div>

        <div style={twoCol}>
          <Field label="BMI (kg/m²)" optional>
            <input style={inputCss} type="number" value={bmi}
              onChange={e => setBmi(e.target.value)} placeholder="e.g. 31.2" step="0.1" />
          </Field>
          <Field label="Systolic BP (mmHg)" optional>
            <input style={inputCss} type="number" value={sbp}
              onChange={e => setSbp(e.target.value)} placeholder="e.g. 152" />
          </Field>
        </div>

        <div style={twoCol}>
          <Field label="Total:HDL cholesterol ratio" optional>
            <input style={inputCss} type="number" value={cholRatio}
              onChange={e => setCholRatio(e.target.value)} placeholder="e.g. 4.5" step="0.1" />
          </Field>
          <Field label="HbA1c (mmol/mol)" optional>
            <input style={inputCss} type="number" value={hba1c}
              onChange={e => setHba1c(e.target.value)} placeholder="e.g. 52" />
          </Field>
        </div>

        <div style={twoCol}>
          <Field label="Alcohol intake" optional>
            <select style={inputCss} value={alcohol} onChange={e => setAlcohol(e.target.value)}>
              <option value="">Select...</option>
              <option value="none">None</option>
              <option value="low (1–14 units/week)">Low (1–14 units/week)</option>
              <option value="moderate (14–21 units/week)">Moderate (14–21 units/week)</option>
              <option value="high (>21 units/week)">High (&gt;21 units/week)</option>
            </select>
          </Field>
          <Field label="Physical activity" optional>
            <select style={inputCss} value={activity} onChange={e => setActivity(e.target.value)}>
              <option value="">Select...</option>
              <option value="inactive">Inactive</option>
              <option value="low">Low</option>
              <option value="moderate">Moderate</option>
              <option value="active">Active</option>
            </select>
          </Field>
        </div>

        {error && (
          <p style={{ fontSize: '0.83rem', color: '#dc2626', margin: '0.5rem 0 0' }}>{error}</p>
        )}

        <button onClick={generate} disabled={loading} style={{
          width: '100%', padding: '0.65rem',
          background: loading ? '#d1d5db' : '#111827',
          color: loading ? '#9ca3af' : '#fff',
          border: 'none', borderRadius: '8px',
          fontSize: '0.9rem', fontWeight: '500',
          cursor: loading ? 'not-allowed' : 'pointer',
          marginTop: '1rem'
        }}>
          {loading ? 'Generating interpretation...' : 'Generate interpretation'}
        </button>

        <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '0.75rem', textAlign: 'center' }}>
          Educational support only — not a diagnostic tool · Postcodes are not stored or logged
        </p>
      </div>

      {results && resolvedDecile && (
        <>
          <div style={card}>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.35rem'
              }}>
                <span style={{ fontWeight: '600', color: IMD_COLORS[resolvedDecile] }}>
                  IMD Decile {resolvedDecile}
                </span>
                <span>{deprivationLabel(resolvedDecile)}</span>
              </div>
              <div style={{ background: '#f3f4f6', borderRadius: '99px', height: '6px' }}>
                <div style={{
                  background: IMD_COLORS[resolvedDecile],
                  width: `${(resolvedDecile / 10) * 100}%`,
                  height: '6px', borderRadius: '99px'
                }} />
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: '0.68rem', color: '#9ca3af', marginTop: '0.25rem'
              }}>
                <span>Most deprived</span><span>Least deprived</span>
              </div>
            </div>
            <div style={sectionHead}>Risk in context</div>
            <BulletList items={results.context} />
          </div>

          <div style={card}>
            <div style={sectionHead}>Barriers to pathway</div>
            <BulletList items={results.barriers} />
          </div>

          <div style={card}>
            <div style={sectionHead}>Consultation prompts</div>
            <BulletList items={results.prompts} />
          </div>
        </>
      )}
    </div>
  );
}