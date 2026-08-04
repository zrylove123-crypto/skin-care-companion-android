const KEYS = {
  profile: "skin-companion-profile-v1",
  checks: "skin-companion-checks-v1",
  chat: "skin-companion-chat-v1",
  checkins: "skin-companion-checkins-v1",
  healthLogs: "skin-companion-health-logs-v1",
};

const DEFAULT_CHAT = [{
  id: "hello",
  role: "assistant",
  text: "bro，我在。皮肤、减脂、饮食和训练都可以跟我聊，也可以直接发皮肤或餐食照片。",
}];

const HEALTH_PROFILE = {
  age: 28,
  heightCm: 177,
  startWeightJin: 155,
  targetWeightJin: 125,
  bodyFatPercent: 25,
  monthlySafeTargetJin: 147,
  monthlySprintTargetJin: 145,
  conditions: ["轻度高血压", "轻度脂肪肝"],
};

const titles = {
  today: "今天怎么护肤",
  chat: "和我聊聊",
  progress: "皮肤记录",
  weight: "减脂计划",
  settings: "提醒与设置",
};

const pad = (number) => String(number).padStart(2, "0");
const localDate = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const today = localDate();
const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const id = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const numeric = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const profile = read(KEYS.profile, {
  startDate: today,
  morningTime: "08:30",
  eveningTime: "23:00",
  shavedDate: "",
});
let checks = read(KEYS.checks, {});
let chat = read(KEYS.chat, DEFAULT_CHAT);
let checkins = read(KEYS.checkins, []);
let healthLogs = read(KEYS.healthLogs, []);
let shaved = profile.shavedDate === today;
let pendingImage = "";
let sending = false;
let aiConfigured = false;
let ratings = { oil: 2, dry: 0, irritation: 0 };

function daysBetween(start, end) {
  const first = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  return Math.max(1, Math.floor((last - first) / 86400000) + 1);
}

function phaseFor(day) {
  if (day <= 14) return { number: 1, label: "基础适应期", hint: "只做清洁、保湿和防晒" };
  if (day <= 28) return { number: 2, label: "局部疏通期", hint: "周一、周四晚加入水杨酸" };
  if (day <= 42) return { number: 3, label: "抗氧适应期", hint: "周二、周五、周日早加入双抗" };
  return { number: 4, label: "稳定护理期", hint: "双抗可每天早上使用" };
}

function routineFor(day) {
  const weekday = new Date(`${today}T12:00:00`).getDay();
  const phase = phaseFor(day);
  const bhaDay = day >= 15 && (weekday === 1 || weekday === 4) && !shaved;
  const serumDay = day >= 43 || (day >= 29 && [0, 2, 5].includes(weekday));
  return {
    phase,
    morning: [
      { id: "am-clean", title: "温水洗脸", detail: "明显出油才用半泵洁面，轻柔20秒" },
      ...(serumDay
        ? [{ id: "am-serum", title: "双抗精华 1泵", detail: "薄涂全脸，避开眼皮、嘴唇和破损处" }]
        : []),
      { id: "am-moist", title: "按干燥程度涂PM乳", detail: "不紧绷可跳过；局部干就用半泵" },
      { id: "am-spf", title: "防晒 2指长度", detail: "脸、耳朵和前侧脖子，出门前15分钟" },
    ],
    evening: [
      { id: "pm-clean", title: "洁面 1泵", detail: "按摩20—30秒后彻底冲净" },
      ...(bhaDay
        ? [{ id: "pm-bha", title: "水杨酸 2—3滴", detail: "只涂鼻头、鼻翼和下巴，避开破口" }]
        : []),
      { id: "pm-moist", title: "PM乳 1泵", detail: "薄涂全脸，嘴角和鼻翼干处可多一点" },
    ],
  };
}

function current() {
  const day = daysBetween(profile.startDate || today, today);
  return { day, routine: routineFor(day) };
}

function saveProfile() {
  profile.shavedDate = shaved ? today : "";
  write(KEYS.profile, profile);
}

function taskCard(title, time, tone, tasks) {
  const done = tasks.filter((task) => checks[`${today}:${task.id}`]).length;
  return `<article class="routine-card ${tone}">
    <header><div><p>${title}</p><span>${time}</span></div><small>${done}/${tasks.length}</small></header>
    <div>${tasks
      .map((task, index) => {
        const completed = checks[`${today}:${task.id}`];
        return `<button class="task-row ${completed ? "done" : ""}" data-task="${task.id}">
          <span class="task-number">${completed ? "✓" : index + 1}</span>
          <span><strong>${task.title}</strong><small>${task.detail}</small></span>
        </button>`;
      })
      .join("")}</div>
  </article>`;
}

function renderToday() {
  const { day, routine } = current();
  const tasks = [...routine.morning, ...routine.evening];
  const done = tasks.filter((task) => checks[`${today}:${task.id}`]).length;
  const percent = Math.round((done / tasks.length) * 100);
  document.querySelector("#day-pill").textContent = `第${day}天`;
  document.querySelector("#phase-number").textContent = `阶段 ${routine.phase.number}`;
  document.querySelector("#phase-label").textContent = routine.phase.label;
  document.querySelector("#phase-hint").textContent = routine.phase.hint;
  document.querySelector("#progress-value").textContent = `${percent}%`;
  document.querySelector("#progress-ring").style.setProperty("--progress", `${percent * 3.6}deg`);
  document.querySelector("#shave-toggle").classList.toggle("active", shaved);
  document.querySelector("#shave-copy").textContent = shaved ? "已自动避开水杨酸" : "点一下可切换";
  document.querySelector("#routine-list").innerHTML =
    taskCard("早上", profile.morningTime, "morning", routine.morning) +
    taskCard("晚上", profile.eveningTime, "evening", routine.evening);
  document.querySelectorAll("[data-task]").forEach((button) => {
    button.onclick = () => {
      const key = `${today}:${button.dataset.task}`;
      checks[key] = !checks[key];
      write(KEYS.checks, checks);
      renderToday();
    };
  });
}

function setTab(tab) {
  document.querySelectorAll(".screen").forEach((screen) => screen.classList.add("hidden"));
  document.querySelector(`#${tab}-screen`).classList.remove("hidden");
  document.querySelectorAll(".bottom-nav button").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  document.querySelector("#page-title").textContent = titles[tab];
  if (tab === "today") renderToday();
  if (tab === "chat") renderChat();
  if (tab === "progress") renderProgress();
  if (tab === "weight") renderWeight();
  if (tab === "settings") renderSettings();
  window.scrollTo(0, 0);
}

function renderChat() {
  const root = document.querySelector("#messages");
  root.innerHTML = "";
  chat.forEach((message) => {
    const row = document.createElement("div");
    row.className = `message-row ${message.role}`;
    if (message.role === "assistant") {
      const avatar = document.createElement("div");
      avatar.className = "avatar";
      avatar.textContent = "C";
      row.appendChild(avatar);
    }
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    if (message.image) {
      const image = document.createElement("img");
      image.src = message.image;
      image.alt = "用户照片";
      bubble.appendChild(image);
    }
    const paragraph = document.createElement("p");
    paragraph.textContent = message.text;
    bubble.appendChild(paragraph);
    row.appendChild(bubble);
    root.appendChild(row);
  });
  if (sending) {
    const row = document.createElement("div");
    row.className = "message-row assistant";
    row.innerHTML = '<div class="avatar">C</div><div class="bubble typing"><i></i><i></i><i></i></div>';
    root.appendChild(row);
  }
  requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight));
}

function saveChat() {
  write(
    KEYS.chat,
    chat.slice(-30).map(({ id: messageId, role, text }) => ({ id: messageId, role, text })),
  );
}

function setConnection() {
  const element = document.querySelector("#connection");
  element.classList.toggle("online", aiConfigured);
  element.querySelector("b").textContent = aiConfigured ? "AI已连接" : "AI接口等待安全配置";
  document.querySelector("#ai-status").textContent = aiConfigured ? "已连接" : "待连接";
  document.querySelector("#ai-status").classList.toggle("connected", aiConfigured);
  document.querySelector("#clear-ai").classList.toggle("hidden", !aiConfigured);
}

function compress(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const image = new Image();
    reader.onload = () => {
      image.onload = () => {
        const max = 1280;
        const ratio = Math.min(1, max / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * ratio);
        canvas.height = Math.round(image.height * ratio);
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      image.onerror = reject;
      image.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function updateImagePreview() {
  const box = document.querySelector("#image-preview");
  box.classList.toggle("hidden", !pendingImage);
  if (pendingImage) box.querySelector("img").src = pendingImage;
}

function sortedHealthLogs() {
  return [...healthLogs].sort((first, second) => first.date.localeCompare(second.date));
}

function latestHealthLog() {
  const logs = sortedHealthLogs();
  return logs.length ? logs[logs.length - 1] : null;
}

function healthContext() {
  return {
    profile: HEALTH_PROFILE,
    latest: latestHealthLog(),
    recent: sortedHealthLogs().slice(-7),
  };
}

window.onNativeChat = (text, success) => {
  sending = false;
  chat.push({ id: id(), role: "assistant", text });
  saveChat();
  renderChat();
  if (!success && text.includes("设置页")) aiConfigured = false;
  setConnection();
};

function sendMessage(event) {
  event.preventDefault();
  const draft = document.querySelector("#chat-draft");
  const text = draft.value.trim();
  if (sending || (!text && !pendingImage)) return;
  const user = {
    id: id(),
    role: "user",
    text: text || "请看一下我刚拍的照片。",
    image: pendingImage,
  };
  chat.push(user);
  draft.value = "";
  pendingImage = "";
  updateImagePreview();
  saveChat();
  sending = true;
  renderChat();
  const { day, routine } = current();
  const payload = {
    messages: chat.slice(-12).map((message) => ({ role: message.role, content: message.text })),
    image: user.image || "",
    context: {
      date: today,
      skincare: {
        day,
        phase: routine.phase.label,
        shaved,
        oil: ratings.oil,
        dry: ratings.dry,
        irritation: ratings.irritation,
      },
      health: healthContext(),
    },
  };
  if (window.SkinNative) SkinNative.sendChat(JSON.stringify(payload));
  else window.onNativeChat("当前不是安卓安装版，无法连接AI。", false);
}

const scaleWords = {
  oil: ["不油", "微油", "正常", "偏油", "很油"],
  dry: ["不干", "一点", "轻微", "明显", "脱皮"],
  irritation: ["没有", "一点", "轻微", "明显", "灼痛"],
};
const scaleLabels = { oil: "出油", dry: "干燥", irritation: "刺激" };

function renderProgress() {
  const root = document.querySelector("#scales");
  root.innerHTML = Object.keys(scaleWords)
    .map(
      (key) => `<div class="scale">
        <div><strong>${scaleLabels[key]}</strong><span>${scaleWords[key][ratings[key]]}</span></div>
        <div class="scale-buttons">${scaleWords[key]
          .map(
            (_, index) =>
              `<button data-scale="${key}" data-value="${index}" class="${ratings[key] === index ? "active" : ""}">${index + 1}</button>`,
          )
          .join("")}</div>
      </div>`,
    )
    .join("");
  document.querySelectorAll("[data-scale]").forEach((button) => {
    button.onclick = () => {
      ratings[button.dataset.scale] = Number(button.dataset.value);
      renderProgress();
    };
  });
  const history = document.querySelector("#history-list");
  history.innerHTML = checkins.length
    ? checkins
        .slice(-7)
        .reverse()
        .map(
          (item) =>
            `<div class="history-row"><strong>${item.date.slice(5)}</strong><span>油 ${item.oil + 1}/5</span><span>干 ${item.dry + 1}/5</span><span>刺激 ${item.irritation + 1}/5</span></div>`,
        )
        .join("")
    : '<p class="empty">还没有记录，今天开始就好。</p>';
}

function saveCheckin() {
  const note = document.querySelector("#checkin-note");
  const entry = { date: today, ...ratings, note: note.value };
  checkins = [...checkins.filter((item) => item.date !== today), entry].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  write(KEYS.checkins, checkins);
  note.value = "";
  renderProgress();
}

function bmiFor(weightJin) {
  return (weightJin * 0.5) / ((HEALTH_PROFILE.heightCm / 100) ** 2);
}

function bloodPressureAdvice(sys, dia) {
  if (sys === null || dia === null) return null;
  if (sys >= 180 || dia >= 120) {
    return {
      tone: "danger",
      text: "血压达到危险区：安静休息1分钟后复测。若仍这么高并伴胸痛、气短、剧烈头痛、麻木无力、视力或说话异常，立即拨打120；无症状也请尽快联系医生，今天不要训练。",
    };
  }
  if (sys >= 160 || dia >= 100) {
    return {
      tone: "danger",
      text: "今天血压明显偏高：先复测并联系医生评估，暂停大重量和高强度有氧，不要憋气硬顶。",
    };
  }
  if (sys >= 140 || dia >= 90) {
    return {
      tone: "warn",
      text: "血压偏高：今天只做中等强度，发力时呼气，不冲极限重量；连续多天这样请带记录就医。",
    };
  }
  return { tone: "ok", text: "本次血压没有触发训练警报，仍按医生要求和真实身体感觉执行。" };
}

function renderBloodPressureMessage(sys, dia) {
  const box = document.querySelector("#bp-message");
  const advice = bloodPressureAdvice(sys, dia);
  box.className = "bp-message";
  if (!advice) {
    box.classList.add("hidden");
    box.textContent = "";
    return;
  }
  box.classList.add(advice.tone);
  box.textContent = advice.text;
}

function chartFor(logs) {
  const usable = logs.filter((item) => Number.isFinite(item.weight)).slice(-14);
  if (usable.length < 2) return '<p class="empty">再记录1次体重，就会出现趋势线。</p>';
  const values = usable.map((item) => item.weight);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const range = Math.max(1, high - low);
  const points = usable.map((item, index) => {
    const x = 24 + (index * 250) / (usable.length - 1);
    const y = 18 + ((high - item.weight) / range) * 72;
    return { x, y, weight: item.weight };
  });
  return `<svg class="weight-svg" viewBox="0 0 300 125" role="img" aria-label="最近体重趋势">
    <line x1="24" y1="18" x2="274" y2="18"></line>
    <line x1="24" y1="54" x2="274" y2="54"></line>
    <line x1="24" y1="90" x2="274" y2="90"></line>
    <polyline points="${points.map((point) => `${point.x},${point.y}`).join(" ")}"></polyline>
    ${points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="3"></circle>`).join("")}
    <text x="2" y="22">${high.toFixed(1)}</text>
    <text x="2" y="93">${low.toFixed(1)}</text>
    <text x="24" y="116">${usable[0].date.slice(5)}</text>
    <text x="238" y="116">${usable[usable.length - 1].date.slice(5)}</text>
  </svg>`;
}

function weeklyRateFor(logs) {
  if (logs.length < 2) return null;
  const latest = logs[logs.length - 1];
  const latestTime = new Date(`${latest.date}T12:00:00`).getTime();
  const candidates = logs.filter((item) => {
    const gap = (latestTime - new Date(`${item.date}T12:00:00`).getTime()) / 86400000;
    return gap >= 4 && gap <= 9;
  });
  if (!candidates.length) return null;
  return candidates[0].weight - latest.weight;
}

function renderWeight() {
  const logs = sortedHealthLogs();
  const latest = logs.length ? logs[logs.length - 1] : null;
  const todayLog = logs.find((item) => item.date === today) || null;
  const currentWeight = latest?.weight || HEALTH_PROFILE.startWeightJin;
  const lost = HEALTH_PROFILE.startWeightJin - currentWeight;
  const left = currentWeight - HEALTH_PROFILE.targetWeightJin;
  const total = HEALTH_PROFILE.startWeightJin - HEALTH_PROFILE.targetWeightJin;
  const progress = clamp((lost / total) * 100, 0, 100);

  document.querySelector("#current-weight").textContent = currentWeight.toFixed(1);
  document.querySelector("#weight-progress-value").textContent = `${Math.round(progress)}%`;
  document.querySelector("#weight-lost").textContent = `${Math.max(0, lost).toFixed(1)}斤`;
  document.querySelector("#weight-left").textContent = `${Math.max(0, left).toFixed(1)}斤`;
  document.querySelector("#current-bmi").textContent = bmiFor(currentWeight).toFixed(1);
  document.querySelector("#health-log-date").textContent = today.slice(5);

  document.querySelector("#health-weight").value = todayLog?.weight ?? currentWeight;
  document.querySelector("#health-waist").value = todayLog?.waist ?? "";
  document.querySelector("#health-sys").value = todayLog?.sys ?? "";
  document.querySelector("#health-dia").value = todayLog?.dia ?? "";
  document.querySelector("#health-steps").value = todayLog?.steps ?? "";
  document.querySelector("#health-sleep").value = todayLog?.sleep ?? "";
  document.querySelector("#health-trained").value = todayLog?.trained ?? "no";
  document.querySelector("#health-hunger").value = todayLog?.hunger ?? "0";
  document.querySelector("#health-note").value = todayLog?.note ?? "";
  renderBloodPressureMessage(todayLog?.sys ?? null, todayLog?.dia ?? null);

  document.querySelector("#weight-chart").innerHTML = chartFor(logs);
  const weeklyRate = weeklyRateFor(logs);
  const rateElement = document.querySelector("#weekly-rate");
  if (weeklyRate === null) {
    rateElement.textContent = "等待7天数据";
    rateElement.className = "";
  } else {
    rateElement.textContent =
      weeklyRate >= 0 ? `近一周 -${weeklyRate.toFixed(1)}斤` : `近一周 +${Math.abs(weeklyRate).toFixed(1)}斤`;
    rateElement.className = weeklyRate > 2 ? "fast" : "";
  }

  const history = document.querySelector("#weight-history");
  history.innerHTML = logs.length
    ? logs
        .slice(-7)
        .reverse()
        .map(
          (item) => `<div class="weight-history-row">
            <strong>${item.date.slice(5)}</strong>
            <span>${item.weight.toFixed(1)}斤</span>
            <span>${item.steps === null ? "步数—" : `${item.steps}步`}</span>
            <span>${item.sys === null ? "血压—" : `${item.sys}/${item.dia}`}</span>
          </div>`,
        )
        .join("")
    : '<p class="empty">今天开始记录，别用单日波动评价自己。</p>';
}

function saveHealth() {
  const weight = numeric(document.querySelector("#health-weight").value);
  if (weight === null || weight < 90 || weight > 220) {
    alert("请填写90—220斤之间的真实体重。");
    return;
  }
  const waist = numeric(document.querySelector("#health-waist").value);
  const sys = numeric(document.querySelector("#health-sys").value);
  const dia = numeric(document.querySelector("#health-dia").value);
  const steps = numeric(document.querySelector("#health-steps").value);
  const sleep = numeric(document.querySelector("#health-sleep").value);
  if ((sys === null) !== (dia === null)) {
    alert("血压请把高压和低压一起填，暂时没测可以都留空。");
    return;
  }
  const entry = {
    date: today,
    weight,
    waist,
    sys,
    dia,
    steps,
    sleep,
    trained: document.querySelector("#health-trained").value,
    hunger: document.querySelector("#health-hunger").value,
    note: document.querySelector("#health-note").value.trim(),
  };
  healthLogs = [...healthLogs.filter((item) => item.date !== today), entry].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  write(KEYS.healthLogs, healthLogs);
  renderWeight();
  const advice = bloodPressureAdvice(sys, dia);
  if (advice?.tone === "danger") alert(advice.text);
  else alert("今日减脂记录已保存。看7天趋势，不纠结一天的水分波动。");
}

function loadNative() {
  if (!window.SkinNative) return;
  try {
    const settings = JSON.parse(SkinNative.getNativeSettings());
    profile.morningTime = settings.morning || profile.morningTime;
    profile.eveningTime = settings.evening || profile.eveningTime;
    aiConfigured = Boolean(settings.aiConfigured);
    document.querySelector("#ai-endpoint").value =
      settings.aiEndpoint || "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
    document.querySelector("#ai-model").value = settings.aiModel || "qwen3-vl-plus";
    document.querySelector("#ai-protocol").value = settings.aiProtocol || "chat_completions";
    document.querySelector("#app-version").textContent = SkinNative.appVersion();
    saveProfile();
  } catch {}
  setConnection();
}

function renderSettings() {
  document.querySelector("#start-date").value = profile.startDate;
  document.querySelector("#start-date").max = today;
  document.querySelector("#morning-time").value = profile.morningTime;
  document.querySelector("#evening-time").value = profile.eveningTime;
  setConnection();
}

function saveTimes() {
  profile.startDate = document.querySelector("#start-date").value || today;
  profile.morningTime = document.querySelector("#morning-time").value || "08:30";
  profile.eveningTime = document.querySelector("#evening-time").value || "23:00";
  saveProfile();
  if (window.SkinNative) SkinNative.saveReminderTimes(profile.morningTime, profile.eveningTime);
}

function saveAi() {
  const protocol = document.querySelector("#ai-protocol").value;
  const endpoint = document.querySelector("#ai-endpoint").value.trim();
  const model = document.querySelector("#ai-model").value.trim();
  const key = document.querySelector("#ai-key").value.trim();
  const message = document.querySelector("#ai-message");
  if (!window.SkinNative) {
    message.textContent = "请在安卓安装版中配置。";
    return;
  }
  const result = SkinNative.saveAiConfig(protocol, endpoint, model, key);
  if (result === "ok") {
    aiConfigured = true;
    document.querySelector("#ai-key").value = "";
    message.textContent = "连接信息已安全保存在本机，可以去聊天页使用。";
  } else {
    message.textContent = result;
  }
  setConnection();
}

function setupKeyboardAvoidance() {
  const draft = document.querySelector("#chat-draft");
  const viewport = window.visualViewport;
  const update = () => {
    const focused = document.activeElement === draft;
    const inset =
      focused && viewport
        ? Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop))
        : 0;
    document.documentElement.style.setProperty("--keyboard-inset", `${inset}px`);
    document.body.classList.toggle("keyboard-open", focused);
    if (focused) {
      requestAnimationFrame(() => {
        draft.scrollIntoView({ block: "nearest", inline: "nearest" });
      });
    }
  };
  draft.addEventListener("focus", () => {
    update();
    setTimeout(update, 120);
    setTimeout(update, 350);
  });
  draft.addEventListener("blur", () => setTimeout(update, 120));
  window.addEventListener("resize", update);
  if (viewport) {
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
  }
}

document.querySelectorAll(".bottom-nav button").forEach((button) => {
  button.onclick = () => setTab(button.dataset.tab);
});
document.querySelector("#day-pill").onclick = () => setTab("today");
document.querySelector("#shave-toggle").onclick = () => {
  shaved = !shaved;
  saveProfile();
  renderToday();
};
document.querySelector("#chat-form").onsubmit = sendMessage;
document.querySelector("#camera-button").onclick = () => document.querySelector("#photo-input").click();
document.querySelector("#photo-input").onchange = async (event) => {
  const file = event.target.files && event.target.files[0];
  if (file) {
    pendingImage = await compress(file);
    updateImagePreview();
  }
  event.target.value = "";
};
document.querySelector("#image-preview button").onclick = () => {
  pendingImage = "";
  updateImagePreview();
};
document.querySelector("#save-checkin").onclick = saveCheckin;
document.querySelector("#save-health").onclick = saveHealth;
["health-sys", "health-dia"].forEach((fieldId) => {
  document.querySelector(`#${fieldId}`).oninput = () => {
    renderBloodPressureMessage(
      numeric(document.querySelector("#health-sys").value),
      numeric(document.querySelector("#health-dia").value),
    );
  };
});
["start-date", "morning-time", "evening-time"].forEach((fieldId) => {
  document.querySelector(`#${fieldId}`).onchange = saveTimes;
});
document.querySelector("#enable-notifications").onclick = () => {
  saveTimes();
  if (window.SkinNative) SkinNative.enableNotifications();
};
document.querySelector("#save-ai").onclick = saveAi;
document.querySelector("#clear-ai").onclick = () => {
  if (window.SkinNative) SkinNative.clearAiConfig();
  aiConfigured = false;
  document.querySelector("#ai-message").textContent = "本机密钥已清除。";
  setConnection();
};
document.querySelector("#ai-protocol").onchange = (event) => {
  if (event.target.value === "responses") {
    document.querySelector("#ai-endpoint").value = "https://api.openai.com/v1/responses";
    document.querySelector("#ai-model").value = "gpt-5.6-luna";
  } else {
    document.querySelector("#ai-endpoint").value =
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
    document.querySelector("#ai-model").value = "qwen3-vl-plus";
  }
};

loadNative();
renderToday();
setConnection();
setupKeyboardAvoidance();
