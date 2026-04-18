// js/inbody.js
let inbodyRecords = [];
let charts = {};

document.addEventListener('DOMContentLoaded', async () => {
  await App.init();
  if (!App.currentUser) return; // Wait for app.js to handle redirect

  document.getElementById('navUsername').textContent = App.profile?.name || '사용자';
  document.getElementById('navAvatar').textContent = (App.profile?.name || 'U').charAt(0).toUpperCase();

  await loadInbodyRecords();
});

async function loadInbodyRecords() {
  try {
    const { data: records, error } = await supabaseClient
      .from('inbody_records')
      .select('*')
      .eq('user_id', App.currentUser.id)
      .order('record_date', { ascending: true }); // Ascending for charts
      
    if (error) throw error;
    
    inbodyRecords = records;
    
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
    console.error('Error loading inbody records:', err);
    alert('인바디 기록을 불러오는데 실패했습니다.');
  }
}

function renderCharts() {
  const dates = inbodyRecords.map(r => r.record_date);
  const weights = inbodyRecords.map(r => r.weight);
  const skeletalMuscles = inbodyRecords.map(r => r.skeletal_muscle);
  const bodyFatMasses = inbodyRecords.map(r => r.body_fat_mass);
  const bodyFatPercents = inbodyRecords.map(r => r.body_fat_percent);
  const ecwRatios = inbodyRecords.map(r => r.ecw_ratio);
  const scores = inbodyRecords.map(r => r.inbody_score);

  Chart.defaults.color = '#64748b';
  Chart.defaults.font.family = "'Inter', 'Pretendard', sans-serif";

  // 1. 체성분 구성 (막대 그래프) - 최근 1건 기준
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
          'rgba(59, 130, 246, 0.7)', // Blue for weight
          'rgba(16, 185, 129, 0.7)', // Green for muscle
          'rgba(245, 158, 11, 0.7)'  // Orange for fat
        ],
        borderRadius: 6,
        barThickness: 40
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y', // Horizontal bar chart to show C, I, D shape better
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true } }
    }
  });

  // 2. 주요 지표 변화 추이 (꺾은선)
  const ctxTrends = document.getElementById('chartTrends').getContext('2d');
  if (charts.trends) charts.trends.destroy();
  charts.trends = new Chart(ctxTrends, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [
        { label: '체중(kg)', data: weights, borderColor: '#3b82f6', backgroundColor: '#3b82f6', tension: 0.3 },
        { label: '골격근량(kg)', data: skeletalMuscles, borderColor: '#10b981', backgroundColor: '#10b981', tension: 0.3 },
        { label: '체지방량(kg)', data: bodyFatMasses, borderColor: '#f59e0b', backgroundColor: '#f59e0b', tension: 0.3 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }
      },
      scales: { y: { beginAtZero: false } }
    }
  });

  // 3. 체지방률 및 세포외수분비 추이
  const ctxRatio = document.getElementById('chartRatio').getContext('2d');
  if (charts.ratio) charts.ratio.destroy();
  charts.ratio = new Chart(ctxRatio, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [
        { label: '체지방률(%)', data: bodyFatPercents, borderColor: '#ef4444', backgroundColor: '#ef4444', tension: 0.3, yAxisID: 'y' },
        { label: '세포외수분비', data: ecwRatios, borderColor: '#8b5cf6', backgroundColor: '#8b5cf6', tension: 0.3, yAxisID: 'y1' }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }
      },
      scales: {
        y: { type: 'linear', display: true, position: 'left' },
        y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false } }
      }
    }
  });

  // 4. 인바디 점수 추이
  const ctxScore = document.getElementById('chartScore').getContext('2d');
  if (charts.score) charts.score.destroy();
  charts.score = new Chart(ctxScore, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        label: '인바디 점수',
        data: scores,
        borderColor: '#ddca4b',
        backgroundColor: 'rgba(221, 202, 75, 0.2)',
        tension: 0.3,
        fill: true,
        pointRadius: 4,
        pointBackgroundColor: '#ddca4b'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { min: Math.max(0, Math.min(...scores) - 10), max: Math.min(100, Math.max(...scores) + 10) } }
    }
  });
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
