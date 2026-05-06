// js/inbody.js
let inbodyRecords = [];
let charts = {};

document.addEventListener('DOMContentLoaded', async () => {
  const user = Auth.require();
  if (!user) return;

  // 특별관리 대상자 체크
  if (!user.isSpecial) {
    alert('이 페이지는 특별관리 대상자분들께만 제공됩니다.');
    window.location.href = 'dashboard.html';
    return;
  }

  // Use Auth user data or fetch from profiles
  document.getElementById('navUsername').textContent = user.name || '사용자';
  document.getElementById('navAvatar').textContent = (user.name || 'U').charAt(0).toUpperCase();

  await loadInbodyRecords();
});

async function loadInbodyRecords() {
  try {
    const res = await fetch(new URL('api/inbody-data', window.location.href).toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'include'
    });
    const result = await res.json();
    if (!res.ok || !result.ok) throw new Error(result.message || '데이터 로드 실패');
    
    inbodyRecords = result.records;
    
    if (inbodyRecords.length === 0) {
      document.getElementById('noDataMessage').style.display = 'block';
      document.getElementById('inbodyContent').style.display = 'none';
    } else {
      document.getElementById('noDataMessage').style.display = 'none';
      document.getElementById('inbodyContent').style.display = 'block';
      
      renderCharts();
      renderRecordList();
    }
  } catch (err) {
    if (window.location.protocol === 'file:' || (err.message && err.message.includes('Failed to fetch'))) {
      inbodyRecords = [
        { id: 'mock_1', record_date: '2023-09-01', weight: 76.5, skeletal_muscle: 34.2, body_fat_mass: 15.1, bmi: 24.1, body_fat_percent: 19.7, ecw_ratio: 0.385, phase_angle: 4.2, inbody_score: 78, image_url: null },
        { id: 'mock_2', record_date: '2023-10-01', weight: 75.8, skeletal_muscle: 34.6, body_fat_mass: 14.2, bmi: 23.8, body_fat_percent: 18.7, ecw_ratio: 0.382, phase_angle: 4.5, inbody_score: 80, image_url: null },
        { id: 'mock_3', record_date: new Date().toISOString().split('T')[0], weight: 75.2, skeletal_muscle: 35.1, body_fat_mass: 13.5, bmi: 23.4, body_fat_percent: 18.0, ecw_ratio: 0.380, phase_angle: 4.8, inbody_score: 82, image_url: null }
      ];
      
      document.getElementById('noDataMessage').style.display = 'none';
      document.getElementById('inbodyContent').style.display = 'block';
      renderCharts();
      renderRecordList();
      return;
    }
    console.error('Error loading inbody records:', err);
    alert('인바디 기록을 불러오는데 실패했습니다.');
  }
}

function renderCharts() {
  const dates = inbodyRecords.map(r => r.record_date);
  
  Chart.defaults.color = '#64748b';
  Chart.defaults.font.family = "'Inter', 'Pretendard', sans-serif";

  // --- Helper for creating simple line charts ---
  const createLineChart = (id, label, data, color, fill = true) => {
    const ctx = document.getElementById(id).getContext('2d');
    if (charts[id]) charts[id].destroy();
    
    charts[id] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: dates,
        datasets: [{
          label: label,
          data: data,
          borderColor: color,
          backgroundColor: fill ? `${color}20` : color, // 20 is ~12% opacity in hex
          tension: 0.3,
          fill: fill,
          pointRadius: 4,
          pointBackgroundColor: color,
          pointBorderColor: '#fff',
          pointBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            titleColor: '#1e293b',
            bodyColor: '#1e293b',
            borderColor: '#e2e8f0',
            borderWidth: 1,
            padding: 10,
            displayColors: false
          }
        },
        scales: {
          y: { beginAtZero: false, grid: { color: '#f1f5f9' } },
          x: { grid: { display: false } }
        }
      }
    });
  };

  // 0. 체성분 구성 요약 (막대 그래프) - 최근 1건 기준
  const latestRecord = inbodyRecords[inbodyRecords.length - 1];
  const ctxComp = document.getElementById('chartComposition').getContext('2d');
  if (charts.comp) charts.comp.destroy();
  charts.comp = new Chart(ctxComp, {
    type: 'bar',
    data: {
      labels: ['체중(kg)', '골격근량(kg)', '체지방량(kg)'],
      datasets: [{
        label: '측정값',
        data: [latestRecord.weight, latestRecord.skeletal_muscle, latestRecord.body_fat_mass],
        backgroundColor: [
          'rgba(59, 130, 246, 0.7)', 
          'rgba(16, 185, 129, 0.7)', 
          'rgba(245, 158, 11, 0.7)'
        ],
        borderRadius: 6,
        barThickness: 30
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: { 
        x: { beginAtZero: true, grid: { color: '#f1f5f9' } },
        y: { grid: { display: false } }
      }
    }
  });

  // 1 ~ 8. 개별 추이 그래프 생성
  createLineChart('chartWeight',     '체중(kg)',      inbodyRecords.map(r => r.weight),            '#3b82f6');
  createLineChart('chartMuscle',     '골격근량(kg)',    inbodyRecords.map(r => r.skeletal_muscle),   '#10b981');
  createLineChart('chartFatMass',    '체지방량(kg)',    inbodyRecords.map(r => r.body_fat_mass),     '#f59e0b');
  createLineChart('chartBMI',        'BMI',           inbodyRecords.map(r => r.bmi),               '#6366f1');
  createLineChart('chartFatPercent', '체지방률(%)',     inbodyRecords.map(r => r.body_fat_percent),  '#ef4444');
  createLineChart('chartECW',        '세포외수분비',     inbodyRecords.map(r => r.ecw_ratio),         '#06b6d4');
  createLineChart('chartPhaseAngle', '위상각',         inbodyRecords.map(r => r.phase_angle || 0),  '#8b5cf6');
  
  // 인바디 점수는 특별히 노란색 계열로
  createLineChart('chartScore',      '인바디 점수',     inbodyRecords.map(r => r.inbody_score),      '#ddca4b');
}

function renderRecordList() {
  const container = document.getElementById('recordList');
  container.innerHTML = '';
  
  // Create a reversed copy for the list (newest first)
  const reversedRecords = [...inbodyRecords].reverse();
  
  reversedRecords.forEach(r => {
    const item = document.createElement('div');
    item.className = 'record-item';
    
    item.innerHTML = `
      <div class="record-date-badge">${r.record_date}</div>
      <div class="record-details">
        <div class="detail-stat">
          <span class="detail-label">체중</span>
          <span class="detail-val">${r.weight} kg</span>
        </div>
        <div class="detail-stat">
          <span class="detail-label">골격근량</span>
          <span class="detail-val">${r.skeletal_muscle} kg</span>
        </div>
        <div class="detail-stat">
          <span class="detail-label">체지방량</span>
          <span class="detail-val">${r.body_fat_mass} kg</span>
        </div>
        <div class="detail-stat">
          <span class="detail-label">BMI</span>
          <span class="detail-val">${r.bmi}</span>
        </div>
        <div class="detail-stat">
          <span class="detail-label">체지방률</span>
          <span class="detail-val">${r.body_fat_percent}%</span>
        </div>
        <div class="detail-stat">
          <span class="detail-label">세포외수분비</span>
          <span class="detail-val">${r.ecw_ratio}</span>
        </div>
        <div class="detail-stat">
          <span class="detail-label">위상각</span>
          <span class="detail-val">${r.phase_angle || '-'}</span>
        </div>
        <div class="detail-stat">
          <span class="detail-label">인바디 점수</span>
          <span class="detail-val" style="color: var(--gold);">${r.inbody_score}점</span>
        </div>
      </div>
      ${r.image_url ? `<button class="btn-view-image" onclick="showImageModal('${r.image_url}')">결과지 보기</button>` : ''}
    `;
    
    container.appendChild(item);
  });
}

function showImageModal(url) {
  const modal = document.getElementById('imageModal');
  const img = document.getElementById('modalImg');
  img.src = url;
  modal.classList.add('show');
}

function closeImageModal() {
  const modal = document.getElementById('imageModal');
  modal.classList.remove('show');
}
