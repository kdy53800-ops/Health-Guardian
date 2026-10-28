    function closeImageModal() {
      document.getElementById('imageModal').classList.remove('show');
    }
    
    // UI function for list rendering (called from inbody.js)
    function renderRecordList() {
      const tbody = document.getElementById('recordListBody');
      tbody.innerHTML = '';
      
      inbodyRecords.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${r.record_date}</strong></td>
          <td>${r.weight} kg</td>
          <td>${r.skeletal_muscle} kg</td>
          <td>${r.body_fat_percent} %</td>
          <td>${r.phase_angle !== undefined ? r.phase_angle : '-'}</td>
          <td>${r.inbody_score} 점</td>
          <td>
            ${r.image_url ? `<button class="btn" style="padding:4px 8px; font-size:0.8rem;" data-image-url="${escapeAttribute(r.image_url)}" onclick="viewImage(this.dataset.imageUrl)">보기</button>` : '-'}
          </td>
        `;
        tbody.appendChild(tr);
      });
    }
    
    function viewImage(url) {
      const modal = document.getElementById('imageModal');
      const img = document.getElementById('modalImage');
      img.src = url;
      modal.classList.add('show');
    }
