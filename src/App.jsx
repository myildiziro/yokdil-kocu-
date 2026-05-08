import { useState, useRef, useEffect } from "react";

const SYSTEM_PROMPT = `You are a YÖKDİL/YDS English exam coach. You speak Turkish to the user.

## CRITICAL OUTPUT FORMAT
EVERY response MUST end with options in this exact format:
<OPTIONS>
option1
option2
option3
option4
</OPTIONS>

## PHASE 1: NEEDS ANALYSIS
Ask these one at a time:

Step 1 — Exam type:
"Hangi sınava hazırlanıyorsun?"
<OPTIONS>
YÖKDİL
YDS
</OPTIONS>

Step 2 (if YÖKDİL) — Field:
"Hangi alandan giriyorsun?"
<OPTIONS>
Sağlık Bilimleri
Fen Bilimleri
Sosyal Bilimler
</OPTIONS>

Step 3 — Target score:
"Hedef puanın nedir?"
<OPTIONS>
55-60
65-70
75-80
80 ve üzeri
</OPTIONS>

Step 4 — Level:
"Mevcut İngilizce seviyen?"
<OPTIONS>
Başlangıç
Orta
İleri
</OPTIONS>

Step 5 — Weak area:
"En çok zorlandığın alan?"
<OPTIONS>
Kelime
Gramer
Paragraf
Hepsi
</OPTIONS>

After step 5, output diagnosis then options:
DIAGNOSIS:{"sinav_turu":"yokdil","alan":"saglik","zayif_alan":"kelime","seviye":"orta","gunluk_hedef":20}
<OPTIONS>
Kelime Çalış
Gramer
Paragraf
Mini Sınav
</OPTIONS>

## PHASE 2: VOCABULARY MODE
Give 5 words:
WORD:{"word":"prevalence","meaning":"yaygınlık","example":"The prevalence of diabetes has increased.","tip":"from prevail","level":"C1"}

Then ask 8 quiz questions IN ENGLISH. Each question:
[question text]
<OPTIONS>
a) choice1
b) choice2
c) choice3
d) choice4
</OPTIONS>

After user answers: write CORRECT or WRONG, explain in Turkish, ask next question with <OPTIONS>.

Quiz types:
- "What does X mean?"
- "X means:" (EN→TR)
- "Which word means Y in English?" (TR→EN)
- "Which word is closest in meaning to X?"
- "Which word is OPPOSITE in meaning to X?"

After 8 questions:
<OPTIONS>
Devam Et
Başka Konu
Mola
</OPTIONS>

## PHASE 3: GRAMMAR MODE
Explain in Turkish, then 5 questions each with:
<OPTIONS>
a) choice1
b) choice2
c) choice3
d) choice4
</OPTIONS>
Write CORRECT or WRONG after each.

## PHASE 4: READING MODE
English paragraph, then 5 questions each with:
<OPTIONS>
a) choice1
b) choice2
c) choice3
d) choice4
</OPTIONS>
Write CORRECT or WRONG after each.

## CONTENT BY FIELD
- saglik: medical terms, anatomy, pharmacology
- fen: physics, chemistry, engineering
- sosyal: law, economics, sociology
- yds: general academic English

## RULES
- Never use bold (**)
- ALWAYS include <OPTIONS> — this is mandatory in every single response
- Quiz questions in English, explanations in Turkish
- Write STREAK when daily goal reached`;

// Silent self-check prompt — kullanıcıya görünmez
const CHECK_PROMPT = `Your previous response is missing <OPTIONS>...</OPTIONS>. 
Output the same response again but add the appropriate options at the end. 
Do NOT add any meta-commentary. Just output the corrected response directly.`;

const today = () => new Date().toDateString();
const load = () => { try { return JSON.parse(localStorage.getItem("yk11") || "{}"); } catch { return {}; } };
const save = (s) => localStorage.setItem("yk11", JSON.stringify(s));
const ALAN = { saglik: "🏥 Sağlık", fen: "🔬 Fen", sosyal: "📚 Sosyal", yok: "" };
const SINAV = { yokdil: "YÖKDİL", yds: "YDS" };

function parseResponse(text) {
  let clean = text;
  let buttons = [];
  let newWords = [];
  let dogru = 0, yanlis = 0, diagParsed = null, streakDone = false;

  // Diagnosis
  const diagMatch = text.match(/DIAGNOSIS:\{([^}]+)\}/);
  if (diagMatch) {
    try { diagParsed = JSON.parse("{" + diagMatch[1] + "}"); } catch(e) {}
    clean = clean.replace(/DIAGNOSIS:\{[^}]+\}/, "").trim();
  }

  // Words
  const wordPattern = /WORD:\{([^}]+)\}/g;
  let wm;
  while ((wm = wordPattern.exec(text)) !== null) {
    try {
      const w = JSON.parse("{" + wm[1] + "}");
      newWords.push({ ...w, id: Date.now() + Math.random(), learnedAt: new Date().toLocaleDateString("tr-TR") });
    } catch(e) {}
  }
  clean = clean.replace(/WORD:\{[^}]+\}/g, "").trim();

  // Correct/Wrong
  dogru = (text.match(/\bCORRECT\b/g) || []).length;
  yanlis = (text.match(/\bWRONG\b/g) || []).length;
  clean = clean.replace(/\bCORRECT\b/g, "✅ Doğru!").replace(/\bWRONG\b/g, "❌ Yanlış!").trim();

  // Streak
  if (/\bSTREAK\b/.test(text)) { streakDone = true; clean = clean.replace(/\bSTREAK\b/g, "").trim(); }

  // Options from <OPTIONS> tag
  const optMatch = clean.match(/<OPTIONS>\s*([\s\S]*?)\s*<\/OPTIONS>/);
  if (optMatch) {
    buttons = optMatch[1].trim().split("\n").map(b => b.trim()).filter(b => b.length > 0);
    clean = clean.replace(/<OPTIONS>[\s\S]*?<\/OPTIONS>/g, "").trim();
  }

  // Fallback: detect a) b) c) d)
  if (buttons.length === 0) {
    const lines = clean.split("\n");
    const choices = lines.filter(l => /^[a-d]\)\s+.+/i.test(l.trim()));
    if (choices.length >= 2) {
      buttons = choices.map(l => l.trim());
      clean = lines.filter(l => !/^[a-d]\)\s+.+/i.test(l.trim())).join("\n").trim();
    }
  }

  // Word display
  if (newWords.length > 0) {
    const wd = newWords.map(w =>
      `📖 ${w.word} — ${w.meaning}\n   "${w.example}"\n   💡 ${w.tip} [${w.level}]`
    ).join("\n\n");
    clean = wd + (clean ? "\n\n" + clean : "");
  }

  return { clean: clean.trim(), buttons, newWords, dogru, yanlis, diagParsed, streakDone };
}

// API call
const callGemini = async (apiKey, msgs, systemPrompt) => {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: msgs,
        generationConfig: { maxOutputTokens: 8192 }
      })
    }
  );
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
};

// Generate → silent self-check if needed
const callWithSilentCheck = async (apiKey, msgs) => {
  // Step 1: Generate
  let raw = "";
  for (let i = 0; i < 3; i++) {
    try { raw = await callGemini(apiKey, msgs, SYSTEM_PROMPT); if (raw) break; }
    catch(e) {}
    await new Promise(r => setTimeout(r, 1500));
  }
  if (!raw) return null;

  // Step 2: Check if <OPTIONS> present
  if (/<OPTIONS>[\s\S]*?<\/OPTIONS>/.test(raw)) return raw;

  // Step 3: Silent background fix — no user-visible commentary
  try {
    const fixMsgs = [
      ...msgs,
      { role: "model", parts: [{ text: raw }] },
      { role: "user", parts: [{ text: CHECK_PROMPT }] }
    ];
    const fixed = await callGemini(apiKey, fixMsgs, SYSTEM_PROMPT);
    if (fixed && /<OPTIONS>[\s\S]*?<\/OPTIONS>/.test(fixed)) return fixed;
  } catch(e) {}

  return raw; // return original if fix failed
};

export default function App() {
  const s = load();
  const [view, setView] = useState("chat");
  const [messages, setMessages] = useState(s.messages || []);
  const [buttons, setButtons] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("Düşünüyor...");
  const [typing, setTyping] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [diag, setDiag] = useState(s.diag || null);
  const [words, setWords] = useState(s.words || []);
  const [stats, setStats] = useState(s.stats || { dogru: 0, yanlis: 0, streak: 0, lastDay: "" });
  const [toast, setToast] = useState(null);
  const endRef = useRef(null);
  const taRef = useRef(null);
  const initialized = useRef(false);

  useEffect(() => { save({ messages, diag, words, stats }); }, [messages, diag, words, stats]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, typing]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (messages.length === 0) {
      setMessages([{ role: "assistant", content: "Merhaba! 👋 YÖKDİL/YDS koçunuz burada.\n\nHangi sınava hazırlanıyorsun?" }]);
      setButtons(["YÖKDİL", "YDS"]);
    } else {
      setButtons(diag ? ["Kelime Çalış", "Gramer", "Paragraf", "Mini Sınav"] : ["YÖKDİL", "YDS"]);
    }
  }, []);

  const showToast = (msg, type = "ok") => { setToast({ msg, type }); setTimeout(() => setToast(null), 2500); };

  const typeAnim = (text, btns, onDone) => {
    setIsTyping(true); setTyping(""); let i = 0;
    const iv = setInterval(() => {
      i++; setTyping(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(iv); setIsTyping(false); setTyping("");
        setButtons(btns);
        onDone(text);
      }
    }, text.length > 400 ? 6 : 12);
  };

  const send = async (userText) => {
    if (!userText.trim() || loading || isTyping) return;
    setInput("");
    setButtons([]);
    if (taRef.current) taRef.current.style.height = "auto";
    setLoading(true);
    setLoadingMsg("Düşünüyor...");

    const newMsgs = [...messages, { role: "user", content: userText }];
    setMessages(newMsgs);

    const apiKey = import.meta.env.VITE_GEMINI_KEY;
    const geminiMsgs = newMsgs.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

    const t1 = setTimeout(() => setLoadingMsg("Hazırlanıyor..."), 3000);
    const t2 = setTimeout(() => setLoadingMsg("Biraz daha bekle..."), 7000);

    const raw = await callWithSilentCheck(apiKey, geminiMsgs);
    clearTimeout(t1); clearTimeout(t2);

    if (!raw) {
      setLoading(false);
      setButtons(["Tekrar Dene"]);
      setMessages(p => [...p, { role: "assistant", content: "Bağlantı kurulamadı. Tekrar dene." }]);
      return;
    }

    const { clean, buttons: newBtns, newWords, dogru, yanlis, diagParsed, streakDone } = parseResponse(raw);

    if (diagParsed) { setDiag(diagParsed); showToast("✅ Profil oluşturuldu!"); }
    if (newWords.length > 0) {
      setWords(prev => { showToast(`${newWords.length} kelime eklendi! 📚`); return [...prev, ...newWords]; });
    }
    if (dogru > 0 || yanlis > 0 || streakDone) {
      setStats(prev => {
        const isNew = prev.lastDay !== today();
        const ns = streakDone ? (isNew ? prev.streak + 1 : prev.streak) : prev.streak;
        if (streakDone && isNew) showToast(`🔥 ${ns} günlük seri!`, "streak");
        else if (dogru > 0) showToast(`✅ ${dogru} doğru!`);
        return { dogru: prev.dogru + dogru, yanlis: prev.yanlis + yanlis, streak: ns, lastDay: streakDone ? today() : prev.lastDay };
      });
    }

    setLoading(false);
    typeAnim(clean, newBtns, (t) => {
      setMessages(p => [...p, { role: "assistant", content: t }]);
    });
  };

  const hk = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } };
  const acc = stats.dogru + stats.yanlis > 0 ? Math.round(stats.dogru / (stats.dogru + stats.yanlis) * 100) : 0;

  return (
    <div style={S.app}>
      <style>{CSS}</style>
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}

      <header style={S.hdr}>
        <div style={S.hl}>
          <div style={S.logo}>YK</div>
          <div>
            <div style={S.an}>YÖKDİL / YDS Koçu</div>
            <div style={S.as}>AI destekli kişisel çalışma</div>
          </div>
        </div>
        <div style={S.hr}>
          {stats.streak > 0 && <div style={S.stk}>🔥 {stats.streak}</div>}
          <nav style={S.nav}>
            {["chat","words","stats"].map(v => (
              <button key={v} style={{...S.nb, ...(view===v?S.nba:{})}} onClick={() => setView(v)}>
                {v==="chat"?"💬":v==="words"?"📚":"📊"}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {diag && (
        <div style={S.db}>
          <span className="badge blue">{SINAV[diag.sinav_turu]||"YÖKDİL"}</span>
          {diag.alan && diag.alan!=="yok" && <span className="badge orange">{ALAN[diag.alan]}</span>}
          <span className="badge purple">{diag.zayif_alan==="kelime"?"📚 Kelime":diag.zayif_alan==="gramer"?"🔤 Gramer":"📖 Paragraf"}</span>
          <span className="badge green">{diag.seviye==="baslangic"?"🌱 Başlangıç":diag.seviye==="orta"?"🌿 Orta":"🌳 İleri"}</span>
          <span className="badge gray">🎯 {diag.gunluk_hedef}/gün</span>
        </div>
      )}

      {view === "chat" && (
        <>
          <div style={S.msgs}>
            {messages.map((m,i) => (
              <div key={i} style={{display:"flex",alignItems:"flex-end",gap:8,flexDirection:m.role==="user"?"row-reverse":"row"}}>
                {m.role!=="user" && <Av />}
                <div className={m.role==="user"?"ub":"ab"}>{m.content}</div>
              </div>
            ))}
            {loading && (
              <div style={{display:"flex",alignItems:"flex-end",gap:8}}>
                <Av />
                <div className="ab" style={{padding:"14px 16px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{display:"flex",gap:5}}>{[0,1,2].map(i=><div key={i} className="dot" style={{animationDelay:`${i*0.2}s`}}/>)}</div>
                    <span style={{fontSize:12,color:"#475569"}}>{loadingMsg}</span>
                  </div>
                </div>
              </div>
            )}
            {isTyping && typing && (
              <div style={{display:"flex",alignItems:"flex-end",gap:8}}>
                <Av /><div className="ab">{typing}<span className="cursor"/></div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {!loading && !isTyping && buttons.length > 0 && (
            <div style={S.btnArea}>
              {buttons.map((btn, i) => (
                <button key={i} className="cbtn" onClick={() => send(btn)}>{btn}</button>
              ))}
            </div>
          )}

          <div style={S.ia}>
            <div style={S.ir} className="ir">
              <textarea ref={taRef} rows={1} value={input}
                onChange={e => { setInput(e.target.value); e.target.style.height="auto"; e.target.style.height=Math.min(e.target.scrollHeight,100)+"px"; }}
                onKeyDown={hk} placeholder="veya buraya yaz..." disabled={loading||isTyping} style={S.ta} />
              <button style={{...S.sb, opacity:(!input.trim()||loading||isTyping)?0.3:1}} onClick={() => send(input)} disabled={!input.trim()||loading||isTyping}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
          </div>
        </>
      )}

      {view === "words" && (
        <div style={S.panel}>
          <div style={S.ph}><h2 style={S.pt}>📚 Kelime Listem</h2><span style={S.pc}>{words.length} kelime</span></div>
          {words.length === 0 ? (
            <div style={S.empty}>
              <div style={{fontSize:48,marginBottom:12}}>📖</div>
              <p style={{fontSize:16,color:"#94a3b8"}}>Henüz kelime yok.</p>
              <button className="cbtn" style={{marginTop:16}} onClick={() => { setView("chat"); send("Kelime Çalış"); }}>Başla →</button>
            </div>
          ) : (
            <div style={S.wg}>
              {[...words].reverse().map((w,i) => (
                <div key={w.id||i} className="wcard">
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                    <span style={{fontSize:17,fontWeight:700,color:"#93c5fd"}}>{w.word}</span>
                    <span className={`badge ${w.level==="C2"?"purple":w.level==="C1"?"blue":"green"}`}>{w.level||"B2"}</span>
                  </div>
                  <div style={{fontSize:14,color:"#cbd5e1",marginBottom:5}}>{w.meaning}</div>
                  <div style={{fontSize:12,color:"#64748b",fontStyle:"italic",marginBottom:5}}>"{w.example}"</div>
                  {w.tip && <div style={{fontSize:11,color:"#a78bfa",background:"rgba(139,92,246,0.08)",borderRadius:6,padding:"4px 8px",marginBottom:5}}>💡 {w.tip}</div>}
                  <div style={{fontSize:10,color:"#334155"}}>📅 {w.learnedAt}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {view === "stats" && (
        <div style={S.panel}>
          <div style={S.ph}><h2 style={S.pt}>📊 İstatistikler</h2></div>
          <div style={S.sg}>
            {[["✅","Doğru",stats.dogru,"#22c55e"],["❌","Yanlış",stats.yanlis,"#ef4444"],["🔥","Seri",`${stats.streak}g`,"#f97316"],["🎯","Başarı",`%${acc}`,"#3b82f6"],["📚","Kelime",words.length,"#8b5cf6"]].map(([ic,lb,vl,cl],i) => (
              <div key={i} className="sc">
                <div style={{fontSize:26}}>{ic}</div>
                <div style={{fontSize:20,fontWeight:700,color:cl,marginTop:4}}>{vl}</div>
                <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{lb}</div>
              </div>
            ))}
          </div>
          {stats.dogru+stats.yanlis > 0 && (
            <div style={{background:"#121d33",border:"1px solid rgba(99,179,237,0.1)",borderRadius:14,padding:16,marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#94a3b8",marginBottom:8}}>
                <span>Doğruluk</span><span style={{color:"#22c55e",fontWeight:600}}>%{acc}</span>
              </div>
              <div style={{background:"#1e293b",borderRadius:999,height:8,overflow:"hidden"}}>
                <div style={{height:"100%",background:"linear-gradient(90deg,#22c55e,#86efac)",borderRadius:999,width:`${acc}%`}} />
              </div>
              <p style={{fontSize:12,color:"#64748b",marginTop:8,textAlign:"center"}}>
                {acc>=80?"🌟 Harika!":acc>=60?"💪 İyi gidiyorsun!":"📖 Devam et!"}
              </p>
            </div>
          )}
          {diag && (
            <div style={{background:"#121d33",border:"1px solid rgba(139,92,246,0.15)",borderRadius:14,padding:16,marginBottom:16}}>
              <h3 style={{fontSize:14,fontWeight:600,color:"#c4b5fd",marginBottom:10}}>🧠 Profil</h3>
              <p style={{fontSize:13,color:"#94a3b8",marginBottom:5}}><b>Sınav:</b> {SINAV[diag.sinav_turu]}</p>
              {diag.alan && diag.alan!=="yok" && <p style={{fontSize:13,color:"#94a3b8",marginBottom:5}}><b>Alan:</b> {ALAN[diag.alan]}</p>}
              <p style={{fontSize:13,color:"#94a3b8",marginBottom:5}}><b>Odak:</b> {diag.zayif_alan}</p>
              <p style={{fontSize:13,color:"#94a3b8"}}><b>Hedef:</b> {diag.gunluk_hedef}/gün</p>
            </div>
          )}
          <button className="cbtn" style={{margin:"8px auto",display:"block"}}
            onClick={() => { if(window.confirm("Sıfırlansın mı?")) { localStorage.removeItem("yk11"); window.location.reload(); } }}>
            🗑️ Sıfırla
          </button>
        </div>
      )}
    </div>
  );
}

function Av() {
  return (
    <div style={{width:30,height:30,borderRadius:"50%",background:"linear-gradient(135deg,#3b82f6,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
      </svg>
    </div>
  );
}

const S = {
  app:{fontFamily:"'Sora',sans-serif",background:"#080d1a",minHeight:"100vh",display:"flex",flexDirection:"column",color:"#e2e8f0",overflowX:"hidden"},
  hdr:{background:"linear-gradient(135deg,#0d1b3e,#080d1a)",borderBottom:"1px solid rgba(99,179,237,0.12)",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0},
  hl:{display:"flex",alignItems:"center",gap:10}, hr:{display:"flex",alignItems:"center",gap:10},
  logo:{width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#3b82f6,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"monospace",fontSize:12,fontWeight:600,color:"white"},
  an:{fontSize:14,fontWeight:700,background:"linear-gradient(90deg,#93c5fd,#c4b5fd)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"},
  as:{fontSize:10,color:"#475569",marginTop:1},
  stk:{background:"rgba(249,115,22,0.15)",border:"1px solid rgba(249,115,22,0.3)",borderRadius:20,padding:"3px 10px",fontSize:12,color:"#fb923c",fontWeight:600},
  nav:{display:"flex",gap:4},
  nb:{background:"none",border:"1px solid rgba(99,179,237,0.1)",borderRadius:8,width:34,height:34,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"},
  nba:{background:"rgba(59,130,246,0.15)",borderColor:"rgba(59,130,246,0.3)"},
  db:{background:"rgba(15,23,42,0.8)",borderBottom:"1px solid rgba(59,130,246,0.08)",padding:"8px 16px",display:"flex",gap:6,flexWrap:"wrap",flexShrink:0},
  msgs:{flex:1,overflowY:"auto",padding:"16px 16px 8px",display:"flex",flexDirection:"column",gap:12},
  btnArea:{padding:"10px 16px",display:"flex",flexWrap:"wrap",gap:8,flexShrink:0,background:"#0d1424",borderTop:"1px solid rgba(99,179,237,0.06)"},
  ia:{padding:"6px 16px 14px",background:"#080d1a",flexShrink:0},
  ir:{display:"flex",gap:8,alignItems:"flex-end",background:"#121d33",border:"1px solid rgba(99,179,237,0.12)",borderRadius:16,padding:"8px 8px 8px 14px"},
  ta:{flex:1,background:"none",border:"none",outline:"none",color:"#e2e8f0",fontFamily:"'Sora',sans-serif",fontSize:14,resize:"none",maxHeight:100,lineHeight:1.5,padding:"4px 0"},
  sb:{width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#2563eb,#7c3aed)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0},
  panel:{flex:1,overflowY:"auto",padding:"16px"},
  ph:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16},
  pt:{fontSize:17,fontWeight:700,color:"#e2e8f0"},
  pc:{fontSize:12,color:"#64748b",background:"rgba(99,179,237,0.07)",border:"1px solid rgba(99,179,237,0.12)",borderRadius:20,padding:"3px 10px"},
  empty:{textAlign:"center",padding:"60px 20px"},
  wg:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12},
  sg:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:10,marginBottom:20},
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-thumb{background:#1e293b;border-radius:4px;}
.badge{font-size:11px;padding:3px 10px;border-radius:20px;font-weight:500;border:1px solid;display:inline-flex;align-items:center;}
.badge.blue{background:rgba(59,130,246,0.12);border-color:rgba(59,130,246,0.25);color:#93c5fd;}
.badge.purple{background:rgba(139,92,246,0.12);border-color:rgba(139,92,246,0.25);color:#c4b5fd;}
.badge.green{background:rgba(34,197,94,0.12);border-color:rgba(34,197,94,0.25);color:#86efac;}
.badge.orange{background:rgba(249,115,22,0.12);border-color:rgba(249,115,22,0.25);color:#fb923c;}
.badge.gray{background:rgba(100,116,139,0.12);border-color:rgba(100,116,139,0.25);color:#94a3b8;}
.ab{max-width:82%;padding:12px 16px;border-radius:18px 18px 18px 4px;font-size:14px;line-height:1.75;white-space:pre-wrap;background:#121d33;border:1px solid rgba(99,179,237,0.08);color:#cbd5e1;}
.ub{max-width:82%;padding:12px 16px;border-radius:18px 18px 4px 18px;font-size:14px;line-height:1.75;white-space:pre-wrap;background:linear-gradient(135deg,#2563eb,#7c3aed);color:white;}
.dot{width:6px;height:6px;border-radius:50%;background:#3b82f6;animation:bounce 1.2s infinite ease-in-out;}
@keyframes bounce{0%,80%,100%{transform:scale(0.6);opacity:0.3}40%{transform:scale(1);opacity:1}}
.cursor{display:inline-block;width:2px;height:14px;background:#3b82f6;margin-left:2px;vertical-align:middle;animation:blink 0.8s infinite;}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
.cbtn{
  background:linear-gradient(135deg,rgba(37,99,235,0.12),rgba(124,58,237,0.12));
  border:1.5px solid rgba(99,179,237,0.2);
  color:#e2e8f0;border-radius:12px;padding:11px 18px;
  font-size:14px;font-family:'Sora',sans-serif;cursor:pointer;
  transition:all 0.15s;font-weight:500;min-height:46px;
  display:inline-flex;align-items:center;justify-content:center;
  flex:1;min-width:100px;text-align:center;line-height:1.3;
}
.cbtn:hover{background:linear-gradient(135deg,rgba(37,99,235,0.25),rgba(124,58,237,0.25));border-color:rgba(99,179,237,0.4);}
.cbtn:active{transform:scale(0.96);}
.ir:focus-within{border-color:rgba(59,130,246,0.35)!important;}
.wcard{background:#121d33;border:1px solid rgba(99,179,237,0.08);border-radius:14px;padding:14px;transition:border-color 0.2s;}
.wcard:hover{border-color:rgba(59,130,246,0.25);}
.sc{background:#121d33;border:1px solid rgba(99,179,237,0.08);border-radius:14px;padding:14px;text-align:center;}
.toast{position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#1e293b;border:1px solid rgba(34,197,94,0.3);color:#86efac;padding:10px 20px;border-radius:20px;font-size:13px;z-index:999;animation:sd 0.3s ease;white-space:nowrap;}
.toast.streak{border-color:rgba(249,115,22,0.3);color:#fb923c;}
@keyframes sd{from{opacity:0;transform:translateX(-50%) translateY(-10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
`;
