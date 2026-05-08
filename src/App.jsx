import { useState, useRef, useEffect } from "react";

const SYSTEM_PROMPT = `Sen YÖKDİL ve YDS sınavlarında uzman bir İngilizce koçusun.

════════════════════════════════════════
AŞAMA 1 — İHTİYAÇ ANALİZİ
════════════════════════════════════════
Kullanıcıdan şu bilgileri öğren (maksimum 3 mesajda tamamla):
1. YÖKDİL mi YDS mi?
2. YÖKDİL ise: Sağlık / Fen / Sosyal Bilimler?
3. Hedef puan, sınav tarihi, mevcut seviye, zayıf alan

Analiz tamamlanınca SADECE şunu yaz:
###TANI###
{"sinav_turu":"yokdil","alan":"saglik","zayif_alan":"kelime","seviye":"orta","gunluk_hedef":20}
###TANI_SON###
Hazırız! Kelime çalışmasına başlayalım mı?

════════════════════════════════════════
AŞAMA 2 — KELİME MODU
════════════════════════════════════════

ADIM 1: 5 kelimeyi şu formatta ver:
###KELIME###
{"word":"prevalence","meaning":"yaygınlık","example":"The prevalence of diabetes has increased globally.","tip":"'prevail' fiilinden türemiştir.","level":"C1"}
###KELIME_SON###

ADIM 2: Kelimeler bittikten sonra 4 farklı quiz türü uygula. Her quiz türü MUTLAKA İNGİLİZCE olacak:

QUIZ TİPİ 1 — ÇOKTAN SEÇMELİ (2 soru):
What does "prevalence" mean?
a) the act of treating a disease
b) the widespread occurrence of something
c) a medical examination
d) the cause of a disease
[Doğru cevap: b]

QUIZ TİPİ 2 — KELİME EŞLEŞTİRME İngilizce→Türkçe (2 soru):
Match the word with its Turkish meaning:
"mitigate" means:
a) teşhis etmek
b) hafifletmek
c) uygulamak
d) izlemek
[Doğru cevap: b]

QUIZ TİPİ 3 — KELİME EŞLEŞTİRME Türkçe→İngilizce (2 soru):
Which word means "yaygınlık" in English?
a) incidence
b) adverse
c) prevalence
d) prognosis
[Doğru cevap: c]

QUIZ TİPİ 4 — EŞ ANLAM / ZIT ANLAM (2 soru):
Which word is closest in meaning to "mitigate"?
a) worsen  b) alleviate  c) diagnose  d) prescribe
[Doğru cevap: b]

Which word is OPPOSITE in meaning to "adverse"?
a) harmful  b) negative  c) beneficial  d) chronic
[Doğru cevap: c]

QUIZ KURALLARI:
- Tüm sorular İNGİLİZCE olacak
- Her soru için kullanıcı cevap verdikten sonra ###DOGRU### veya ###YANLIS### yaz
- Yanlış cevapta doğru cevabı açıkla (Türkçe açıklama yapabilirsin)
- 8 soru toplamda

════════════════════════════════════════
AŞAMA 3 — GRAMER MODU
════════════════════════════════════════
YÖKDİL/YDS soru tipleri: Relative Clauses, Passive Voice, Conditionals, Tense, Modals
- Konuyu kısaca Türkçe açıkla
- 5 İngilizce çoktan seçmeli soru sor
- Her soru için ###DOGRU### veya ###YANLIS### yaz

════════════════════════════════════════
AŞAMA 4 — PARAGRAF MODU
════════════════════════════════════════
- Alana uygun İngilizce akademik paragraf ver
- 5 İngilizce soru sor (main idea, detail, inference, vocabulary, tone)
- Her soru için ###DOGRU### veya ###YANLIS### yaz

════════════════════════════════════════
ALAN BAZLI İÇERİK
════════════════════════════════════════
saglik: tıbbi terimler, anatomy, pharmacology, clinical, public health
fen: matematik, fizik, kimya, mühendislik, bilgisayar
sosyal: hukuk, ekonomi, sosyoloji, tarih, psikoloji
yds: genel akademik İngilizce

════════════════════════════════════════
GENEL KURALLAR
════════════════════════════════════════
- Açıklamalar Türkçe, sorular İngilizce
- Bold (**) kullanma, düz metin yaz
- Kısa ve öz ol
- Her aktivite sonunda "Devam mı?" diye sor
- Günlük hedefe ulaşınca ###STREAK### yaz`;

const today = () => new Date().toDateString();
const load = () => { try { return JSON.parse(localStorage.getItem("yk5") || "{}"); } catch { return {}; } };
const save = (s) => localStorage.setItem("yk5", JSON.stringify(s));

const ALAN = { saglik: "🏥 Sağlık", fen: "🔬 Fen", sosyal: "📚 Sosyal", yok: "" };
const SINAV = { yokdil: "YÖKDİL", yds: "YDS" };

function parseResponse(text) {
  let clean = text;
  let newWords = [];
  let dogru = 0, yanlis = 0;
  let diagParsed = null;
  let streakDone = false;

  // Tanı parse
  const taniMatch = text.match(/###TANI###\s*([\s\S]*?)\s*###TANI_SON###/);
  if (taniMatch) {
    try {
      diagParsed = JSON.parse(taniMatch[1].trim());
      console.log("✅ Tanı OK:", diagParsed);
    } catch(e) {
      console.log("❌ Tanı hatası:", e.message);
    }
    clean = clean.replace(/###TANI###[\s\S]*?###TANI_SON###/g, "").trim();
  }

  // Kelime parse
  const kelimePattern = /###KELIME###\s*([\s\S]*?)\s*###KELIME_SON###/g;
  let km;
  while ((km = kelimePattern.exec(text)) !== null) {
    try {
      const w = JSON.parse(km[1].trim());
      newWords.push({ ...w, id: Date.now() + Math.random(), learnedAt: new Date().toLocaleDateString("tr-TR") });
      console.log("✅ Kelime:", w.word);
    } catch(e) {
      console.log("❌ Kelime hatası:", e.message);
    }
  }
  clean = clean.replace(/###KELIME###[\s\S]*?###KELIME_SON###/g, "").trim();

  // Doğru/Yanlış
  dogru = (text.match(/###DOGRU###/g) || []).length;
  yanlis = (text.match(/###YANLIS###/g) || []).length;
  clean = clean.replace(/###DOGRU###/g, "✅ Doğru!").replace(/###YANLIS###/g, "❌ Yanlış!").trim();

  // Streak
  if (text.includes("###STREAK###")) {
    streakDone = true;
    clean = clean.replace(/###STREAK###/g, "").trim();
  }

  // Kelimeleri sohbette göster
  if (newWords.length > 0) {
    const wordDisplay = newWords.map(w =>
      `📖 ${w.word} — ${w.meaning}\n   Örnek: "${w.example}"\n   💡 ${w.tip} [${w.level}]`
    ).join("\n\n");
    clean = wordDisplay + (clean ? "\n\n" + clean : "");
  }

  console.log("CLEAN:", clean.slice(0, 100));
  return { clean, newWords, dogru, yanlis, diagParsed, streakDone };
}

export default function App() {
  const s = load();
  const [view, setView] = useState("chat");
  const [messages, setMessages] = useState(s.messages || [
    { role: "assistant", content: "Merhaba! 👋 YÖKDİL/YDS koçunuz burada.\n\nYÖKDİL mi yoksa YDS mi sınavına giriyorsun?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [diag, setDiag] = useState(s.diag || null);
  const [words, setWords] = useState(s.words || []);
  const [stats, setStats] = useState(s.stats || { dogru: 0, yanlis: 0, streak: 0, lastDay: "" });
  const [toast, setToast] = useState(null);
  const endRef = useRef(null);
  const taRef = useRef(null);

  useEffect(() => { save({ messages, diag, words, stats }); }, [messages, diag, words, stats]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, typing]);

  const showToast = (msg, type = "ok") => { setToast({ msg, type }); setTimeout(() => setToast(null), 2500); };

  const typeAnim = (text, onDone) => {
    setIsTyping(true); setTyping(""); let i = 0;
    const iv = setInterval(() => {
      i++; setTyping(text.slice(0, i));
      if (i >= text.length) { clearInterval(iv); setIsTyping(false); setTyping(""); onDone(text); }
    }, text.length > 300 ? 6 : 12);
  };

  const send = async (userText) => {
    if (!userText.trim() || loading || isTyping) return;
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";
    setLoading(true);
    const newMsgs = [...messages, { role: "user", content: userText }];
    setMessages(newMsgs);

    const apiKey = import.meta.env.VITE_GEMINI_KEY;
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: newMsgs.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
            generationConfig: { maxOutputTokens: 8192 }
          })
        }
      );
      const data = await res.json();
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      console.log("RAW:", raw.slice(0, 200));

      if (!raw) {
        setLoading(false);
        setMessages(p => [...p, { role: "assistant", content: "⚠️ Yanıt alınamadı." }]);
        return;
      }

      const { clean, newWords, dogru, yanlis, diagParsed, streakDone } = parseResponse(raw);

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
      typeAnim(clean, (t) => setMessages(p => [...p, { role: "assistant", content: t }]));
    } catch(e) {
      console.error(e);
      setLoading(false);
      setMessages(p => [...p, { role: "assistant", content: "⚠️ Bağlantı hatası." }]);
    }
  };

  const hk = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } };
  const acc = stats.dogru + stats.yanlis > 0 ? Math.round(stats.dogru / (stats.dogru + stats.yanlis) * 100) : 0;
  const qr = diag
    ? ["Devam 💪", "Kelime çalış 📚", "Gramer 🔤", "Paragraf 📖", "Mini sınav 🎯"]
    : ["YÖKDİL'e gireceğim", "YDS'ye gireceğim"];

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
            {messages.map((m,i) => <Bubble key={i} msg={m} />)}
            {loading && !isTyping && <Loading />}
            {isTyping && typing && <Bubbling text={typing} />}
            <div ref={endRef} />
          </div>
          {!loading && !isTyping && (
            <div style={S.qw}>{qr.map((q,i) => <button key={i} className="qbtn" onClick={() => send(q)}>{q}</button>)}</div>
          )}
          <div style={S.ia}>
            <div style={S.ir} className="ir">
              <textarea ref={taRef} rows={1} value={input}
                onChange={e => { setInput(e.target.value); e.target.style.height="auto"; e.target.style.height=Math.min(e.target.scrollHeight,120)+"px"; }}
                onKeyDown={hk} placeholder="Mesajını yaz..." disabled={loading||isTyping} style={S.ta} />
              <button style={{...S.sb, opacity:(!input.trim()||loading||isTyping)?0.3:1}} onClick={() => send(input)} disabled={!input.trim()||loading||isTyping}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
            <p style={S.hint}>Enter gönder · Shift+Enter yeni satır</p>
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
              <button className="qbtn" style={{marginTop:16}} onClick={() => { setView("chat"); send("Kelime çalış"); }}>Başla →</button>
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
              <div key={i} className="sc"><div style={{fontSize:26}}>{ic}</div><div style={{fontSize:20,fontWeight:700,color:cl,marginTop:4}}>{vl}</div><div style={{fontSize:11,color:"#64748b",marginTop:2}}>{lb}</div></div>
            ))}
          </div>
          {stats.dogru+stats.yanlis > 0 && (
            <div style={{background:"#121d33",border:"1px solid rgba(99,179,237,0.1)",borderRadius:14,padding:16,marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#94a3b8",marginBottom:8}}><span>Doğruluk</span><span style={{color:"#22c55e",fontWeight:600}}>%{acc}</span></div>
              <div style={{background:"#1e293b",borderRadius:999,height:8,overflow:"hidden"}}>
                <div style={{height:"100%",background:"linear-gradient(90deg,#22c55e,#86efac)",borderRadius:999,width:`${acc}%`}} />
              </div>
              <p style={{fontSize:12,color:"#64748b",marginTop:8,textAlign:"center"}}>{acc>=80?"🌟 Harika!":acc>=60?"💪 İyi gidiyorsun!":"📖 Devam et!"}</p>
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
          <button className="qbtn" style={{margin:"8px auto",display:"block"}}
            onClick={() => { if(window.confirm("Sıfırlansın mı?")) { localStorage.removeItem("yk5"); window.location.reload(); } }}>
            🗑️ Sıfırla
          </button>
        </div>
      )}
    </div>
  );
}

function Bubble({ msg }) {
  const u = msg.role === "user";
  return (
    <div style={{display:"flex",alignItems:"flex-end",gap:8,flexDirection:u?"row-reverse":"row"}}>
      {!u && <Av />}
      <div className={u?"ub":"ab"}>{msg.content}</div>
    </div>
  );
}

function Loading() {
  return (
    <div style={{display:"flex",alignItems:"flex-end",gap:8}}>
      <Av />
      <div className="ab" style={{padding:"14px 16px"}}>
        <div style={{display:"flex",gap:5}}>{[0,1,2].map(i=><div key={i} className="dot" style={{animationDelay:`${i*0.2}s`}}/>)}</div>
      </div>
    </div>
  );
}

function Bubbling({ text }) {
  return (
    <div style={{display:"flex",alignItems:"flex-end",gap:8}}>
      <Av />
      <div className="ab">{text}<span className="cursor"/></div>
    </div>
  );
}

function Av() {
  return (
    <div style={{width:30,height:30,borderRadius:"50%",background:"linear-gradient(135deg,#3b82f6,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
    </div>
  );
}

const S = {
  app:{fontFamily:"'Sora',sans-serif",background:"#080d1a",minHeight:"100vh",display:"flex",flexDirection:"column",color:"#e2e8f0",overflowX:"hidden"},
  hdr:{background:"linear-gradient(135deg,#0d1b3e,#080d1a)",borderBottom:"1px solid rgba(99,179,237,0.12)",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0},
  hl:{display:"flex",alignItems:"center",gap:10},
  hr:{display:"flex",alignItems:"center",gap:10},
  logo:{width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#3b82f6,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"monospace",fontSize:12,fontWeight:600,color:"white"},
  an:{fontSize:14,fontWeight:700,background:"linear-gradient(90deg,#93c5fd,#c4b5fd)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"},
  as:{fontSize:10,color:"#475569",marginTop:1},
  stk:{background:"rgba(249,115,22,0.15)",border:"1px solid rgba(249,115,22,0.3)",borderRadius:20,padding:"3px 10px",fontSize:12,color:"#fb923c",fontWeight:600},
  nav:{display:"flex",gap:4},
  nb:{background:"none",border:"1px solid rgba(99,179,237,0.1)",borderRadius:8,width:34,height:34,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"},
  nba:{background:"rgba(59,130,246,0.15)",borderColor:"rgba(59,130,246,0.3)"},
  db:{background:"rgba(15,23,42,0.8)",borderBottom:"1px solid rgba(59,130,246,0.08)",padding:"8px 16px",display:"flex",gap:6,flexWrap:"wrap",flexShrink:0},
  msgs:{flex:1,overflowY:"auto",padding:"20px 16px",display:"flex",flexDirection:"column",gap:14},
  qw:{padding:"8px 16px 0",display:"flex",gap:6,flexWrap:"wrap",flexShrink:0},
  ia:{padding:"10px 16px 14px",background:"#080d1a",borderTop:"1px solid rgba(99,179,237,0.07)",flexShrink:0},
  ir:{display:"flex",gap:8,alignItems:"flex-end",background:"#121d33",border:"1px solid rgba(99,179,237,0.12)",borderRadius:16,padding:"8px 8px 8px 14px"},
  ta:{flex:1,background:"none",border:"none",outline:"none",color:"#e2e8f0",fontFamily:"'Sora',sans-serif",fontSize:14,resize:"none",maxHeight:120,lineHeight:1.5,padding:"4px 0"},
  sb:{width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#2563eb,#7c3aed)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0},
  hint:{fontSize:10,color:"#1e293b",marginTop:5,textAlign:"center"},
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
.ab{max-width:78%;padding:12px 16px;border-radius:18px 18px 18px 4px;font-size:14px;line-height:1.75;white-space:pre-wrap;background:#121d33;border:1px solid rgba(99,179,237,0.08);color:#cbd5e1;}
.ub{max-width:78%;padding:12px 16px;border-radius:18px 18px 4px 18px;font-size:14px;line-height:1.75;white-space:pre-wrap;background:linear-gradient(135deg,#2563eb,#7c3aed);color:white;}
.dot{width:6px;height:6px;border-radius:50%;background:#3b82f6;animation:bounce 1.2s infinite ease-in-out;}
@keyframes bounce{0%,80%,100%{transform:scale(0.6);opacity:0.3}40%{transform:scale(1);opacity:1}}
.cursor{display:inline-block;width:2px;height:14px;background:#3b82f6;margin-left:2px;vertical-align:middle;animation:blink 0.8s infinite;}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
.qbtn{background:rgba(59,130,246,0.07);border:1px solid rgba(59,130,246,0.18);color:#93c5fd;border-radius:20px;padding:6px 14px;font-size:12px;font-family:'Sora',sans-serif;cursor:pointer;transition:all 0.2s;}
.qbtn:hover{background:rgba(59,130,246,0.15);border-color:rgba(59,130,246,0.35);transform:translateY(-1px);}
.ir:focus-within{border-color:rgba(59,130,246,0.35)!important;}
.wcard{background:#121d33;border:1px solid rgba(99,179,237,0.08);border-radius:14px;padding:14px;transition:border-color 0.2s;}
.wcard:hover{border-color:rgba(59,130,246,0.25);}
.sc{background:#121d33;border:1px solid rgba(99,179,237,0.08);border-radius:14px;padding:14px;text-align:center;}
.toast{position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#1e293b;border:1px solid rgba(34,197,94,0.3);color:#86efac;padding:10px 20px;border-radius:20px;font-size:13px;z-index:999;animation:sd 0.3s ease;white-space:nowrap;}
.toast.streak{border-color:rgba(249,115,22,0.3);color:#fb923c;}
@keyframes sd{from{opacity:0;transform:translateX(-50%) translateY(-10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
`;
