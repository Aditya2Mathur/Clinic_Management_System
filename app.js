/* app.js */
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzP9G_wCTsuLTsfj4OHPmGt5-HyIxnk4jC2FkMrsNnZ37zpn8HvYoWSdGpuBoANB9M/exec';

/* Navigation Logic */
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.page-section');

navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        navItems.forEach(n => n.classList.remove('active'));
        sections.forEach(s => s.classList.add('hidden'));
        
        item.classList.add('active');
        const targetId = item.getAttribute('data-target');
        document.getElementById(targetId).classList.remove('hidden');

        if(targetId === 'dashboard') loadDashboardData();
        if(targetId === 'patient-list') {
            loadDashboardData().then(() => renderPatientList('daily'));
        }
    });
});

/* Dashboard Logic */
let visitsChartInstance = null;
function initChart(dates, counts) {
    const ctx = document.getElementById('visitsChart');
    if(!ctx) return;
    if (visitsChartInstance) visitsChartInstance.destroy();
    
    if (dates.length === 0) {
        let defaultDates = [];
        let d = new Date();
        for(let i=6; i>=0; i--) {
            let temp = new Date();
            temp.setDate(d.getDate() - i);
            defaultDates.push(temp.toLocaleDateString('en-GB', {day:'numeric', month:'short'}));
        }
        dates = defaultDates;
        counts = [0,0,0,0,0,0,0];
    }

    visitsChartInstance = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: dates,
            datasets: [{
                label: 'Patient Visits',
                data: counts,
                backgroundColor: 'rgba(2, 132, 199, 0.7)',
                borderColor: 'rgba(2, 132, 199, 1)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0 } }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}
initChart([], []);

let globalRecords = [];
let dataLoaded = false;

async function loadDashboardData() {
    if(dataLoaded) {
        updateDashboardCards();
        return;
    }
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL);
        const data = await response.json();
        globalRecords = data || [];
        dataLoaded = true;
        updateDashboardCards();
    } catch(err) {
        console.error("Error loading dashboard data:", err);
    }
}

function updateDashboardCards() {
    const today = new Date().toLocaleDateString('en-GB');
    let daily = 0, weekly = 0, monthly = 0;
    
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const dateCounts = {};

    globalRecords.forEach(row => {
        const dateStr = row['Timestamp']; 
        if(!dateStr) return;
        const rDate = new Date(dateStr);
        
        if(rDate.toLocaleDateString('en-GB') === today) daily++;
        if(rDate >= oneWeekAgo) weekly++;
        if(rDate >= oneMonthAgo) monthly++;

        const shortDate = rDate.toLocaleDateString('en-GB', {day: 'numeric', month: 'short'});
        dateCounts[shortDate] = (dateCounts[shortDate] || 0) + 1;
    });

    document.getElementById('stat-daily').textContent = daily;
    document.getElementById('stat-weekly').textContent = weekly;
    document.getElementById('stat-monthly').textContent = monthly;
    // Collection calculation based on 5-day free visits logic
    let tempCollection = 0;
    const todayPatients = globalRecords.filter(r => r['Timestamp'] && new Date(r['Timestamp']).toLocaleDateString('en-GB') === today);
    todayPatients.forEach(p => {
        const phone = p.phone || p['Phone'];
        if(!phone) { tempCollection += 500; return; }
        const pDate = new Date(p['Timestamp']);
        const pastVisits = globalRecords.filter(r => {
            const rPhone = r.phone || r['Phone'];
            if(!rPhone || rPhone.toString() !== phone.toString()) return false;
            const rDate = new Date(r['Timestamp']);
            return rDate < pDate && (pDate - rDate) <= 5 * 24 * 60 * 60 * 1000;
        });
        if(pastVisits.length === 0) {
            tempCollection += 500;
        }
    });
    document.getElementById('stat-collection').textContent = '₹' + tempCollection.toLocaleString(); 

    const sortedDates = Object.keys(dateCounts).sort((a,b) => new Date(a) - new Date(b)).slice(-7);
    const counts = sortedDates.map(d => dateCounts[d]);
    if(sortedDates.length > 0) initChart(sortedDates, counts);
}

loadDashboardData();

/* Prescription Logic */
let pendingFormData = null;

document.getElementById('p-phone').addEventListener('blur', (e) => {
    const phone = e.target.value.trim();
    if(phone.length >= 10 && globalRecords.length > 0) {
        let matching = globalRecords.filter(r => (r.phone && r.phone.toString() === phone) || (r['Phone'] && r['Phone'].toString() === phone));
        if(matching.length > 0) {
            matching.sort((a,b) => new Date(b['Timestamp']) - new Date(a['Timestamp']));
            const latest = matching[0];
            
            const oldPid = latest.patientId || latest['Patient ID'];
            if(oldPid) document.getElementById('p-pid').value = oldPid;
            
            if(!document.getElementById('p-name').value) document.getElementById('p-name').value = latest.name || latest['Name'] || '';
            if(!document.getElementById('p-age').value) document.getElementById('p-age').value = latest.age || latest['Age'] || '';
            if(!document.getElementById('p-gender').value) document.getElementById('p-gender').value = latest.gender || latest['Gender'] || '';
            if(!document.getElementById('p-address').value) document.getElementById('p-address').value = latest.address || latest['Address'] || '';
            if(!document.getElementById('p-weight').value) document.getElementById('p-weight').value = latest.weight || latest['Weight'] || '';

            const validStr = latest.validTill || latest['Valid Till'];
            let isFree = false;
            if(validStr) {
                const parts = validStr.split('/');
                if(parts.length === 3) {
                    const validDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                    const todayDate = new Date();
                    todayDate.setHours(0,0,0,0);
                    if(validDate >= todayDate) {
                        isFree = true;
                    }
                }
            }

            const feeInput = document.getElementById('p-fee');
            const statusMsg = document.getElementById('status-message');
            if(isFree) {
                feeInput.value = 0;
                statusMsg.className = 'status-message status-success';
                statusMsg.innerHTML = `<i class="ph ph-check-circle"></i> <strong>Returning Patient (Visit #${matching.length + 1}):</strong> Previous prescription is still valid (5 days). Fee waived.`;
                statusMsg.style.display = 'block';
            } else {
                feeInput.value = 500;
                statusMsg.className = 'status-message status-success';
                statusMsg.innerHTML = `<i class="ph ph-info"></i> <strong>Returning Patient (Visit #${matching.length + 1}):</strong> Details auto-filled. Previous prescription expired. Standard fee applies.`;
                statusMsg.style.display = 'block';
            }
        } else {
            document.getElementById('status-message').style.display = 'none';
            document.getElementById('p-fee').value = 500;
        }
    }
});

document.getElementById('rx-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const randomHex = Math.random().toString(36).substr(2, 6).toUpperCase();
    const apptId = 'APT-' + randomHex;
    
    let pid = document.getElementById('p-pid').value.trim();
    if(!pid) {
        pid = 'PID-' + Math.floor(10000 + Math.random() * 90000);
        document.getElementById('p-pid').value = pid;
    }

    const today = new Date();
    const validDate = new Date(today);
    validDate.setDate(today.getDate() + 5);
    
    const phoneVal = document.getElementById('p-phone').value.trim();
    const matchingCount = globalRecords.filter(r => (r.phone || r['Phone']) == phoneVal).length;
    
    pendingFormData = {
        appointmentId: apptId,
        patientId: pid,
        name: document.getElementById('p-name').value,
        age: document.getElementById('p-age').value,
        gender: document.getElementById('p-gender').value,
        phone: phoneVal,
        address: document.getElementById('p-address').value,
        weight: document.getElementById('p-weight').value,
        symptoms: document.getElementById('p-symptoms').value || 'None',
        fee: document.getElementById('p-fee').value,
        visitCount: matchingCount + 1,
        validTill: validDate.toLocaleDateString('en-GB')
    };

    // Show Preview Template
    document.querySelector('.prescription-form-container').style.display = 'none';
    
    document.getElementById('print-name').textContent = pendingFormData.name;
    document.getElementById('print-age').textContent = pendingFormData.age;
    let gen = pendingFormData.gender === 'Male' ? 'M' : (pendingFormData.gender === 'Female' ? 'F' : 'O');
    document.getElementById('print-gender').textContent = gen;
    document.getElementById('print-date').textContent = today.toLocaleDateString('en-GB');
    
    document.getElementById('out-phone').textContent = pendingFormData.phone;
    document.getElementById('out-pid').textContent = pendingFormData.patientId;
    document.getElementById('out-weight').textContent = pendingFormData.weight;
    document.getElementById('out-id').textContent = pendingFormData.appointmentId;
    document.getElementById('out-visit').textContent = pendingFormData.visitCount;
    document.getElementById('out-symptoms').textContent = pendingFormData.symptoms;
    
    document.getElementById('preview-actions').style.display = 'block';
    document.getElementById('view-actions').style.display = 'none';
    document.getElementById('print-template').style.display = 'block';
});

function editPreview() {
    document.getElementById('print-template').style.display = 'none';
    document.querySelector('.prescription-form-container').style.display = 'block';
}

async function confirmAndSaveRx() {
    if(!pendingFormData) return;
    const submitBtn = document.getElementById('btn-confirm-rx');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Saving...';
    submitBtn.disabled = true;

    try {
        await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(pendingFormData),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            mode: 'no-cors'
        });
    } catch(err) {
        console.warn("Fetch threw an error, usually harmless local CORS.", err);
    }
    
    document.getElementById('rx-form').reset();
    document.getElementById('status-message').style.display = 'none';
    document.getElementById('p-fee').value = 500;
    
    document.getElementById('preview-actions').style.display = 'none';
    document.getElementById('view-actions').style.display = 'block';

    globalRecords.push({
         ...pendingFormData, 
         Timestamp: new Date().toISOString(),
         'Appointment ID': pendingFormData.appointmentId,
         'Patient ID': pendingFormData.patientId,
         'Name': pendingFormData.name,
         'Phone': pendingFormData.phone,
         'Weight': pendingFormData.weight,
         'Visit Count': pendingFormData.visitCount,
         'Fee': pendingFormData.fee,
         'Valid Till': pendingFormData.validTill
    });
    updateDashboardCards(); 
    
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
    pendingFormData = null;
    
    printCurrentSlip();
}

function resetForm() {
    document.getElementById('rx-form').reset();
    document.getElementById('status-message').style.display = 'none';
    document.getElementById('p-fee').value = 500;
    document.getElementById('p-weight').value = '';
    document.getElementById('print-template').style.display = 'none';
    document.querySelector('.prescription-form-container').style.display = 'block';
}

/* Search Logic */
document.getElementById('btn-search').addEventListener('click', () => {
    const query = document.getElementById('search-input').value.toLowerCase().trim();
    const tbody = document.querySelector('#search-table tbody');
    tbody.innerHTML = '';

    if (!query) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#64748b">Please enter a search query.</td></tr>';
        return;
    }

    const results = globalRecords.filter(r => {
        const phoneMatch = r.phone?.toString().includes(query) || r['Phone']?.toString().includes(query);
        const nameMatch = r.name?.toLowerCase().includes(query) || r['Name']?.toLowerCase().includes(query);
        const idMatch = r.appointmentId?.toLowerCase().includes(query) || r['Appointment ID']?.toLowerCase().includes(query);
        return phoneMatch || nameMatch || idMatch;
    });

    if (results.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#64748b">No records found.</td></tr>';
        return;
    }

    results.forEach(r => {
        const tr = document.createElement('tr');
        const rId = r.appointmentId || r['Appointment ID'];
        const rPid = r.patientId || r['Patient ID'] || '-';
        const rName = r.name || r['Name'];
        const rPhone = r.phone || r['Phone'];
        const rWt = r.weight || r['Weight'] || '-';
        const rTime = r['Timestamp'] ? new Date(r['Timestamp']).toLocaleDateString('en-GB') : '-';
        const rValid = r.validTill || r['Valid Till'];

        const allTime = globalRecords.filter(x => (x.phone || x['Phone']) == rPhone).sort((a,b) => new Date(a['Timestamp']) - new Date(b['Timestamp']));
        let vIndex = allTime.findIndex(x => (x.appointmentId || x['Appointment ID']) === rId);
        const dynamicVisitCount = vIndex >= 0 ? vIndex + 1 : 1;

        tr.innerHTML = `
            <td><strong>${rId}</strong></td>
            <td>${rPid}</td>
            <td>${rName}</td>
            <td>${rPhone}</td>
            <td>${rWt}</td>
            <td style="text-align:center;"><span style="background:var(--blue-100);color:var(--blue-600);padding:2px 8px;border-radius:12px;font-size:0.8rem;font-weight:600;">${dynamicVisitCount}</span></td>
            <td>${rTime}</td>
            <td>${rValid}</td>
        `;
        tbody.appendChild(tr);
    });
});

/* Patient List Logic */
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach(b => {
            b.classList.remove('btn-primary');
            b.classList.add('btn-secondary');
        });
        e.target.classList.remove('btn-secondary');
        e.target.classList.add('btn-primary');
        renderPatientList(e.target.getAttribute('data-filter'));
    });
});

function renderPatientList(filter) {
    const tbody = document.querySelector('#patients-table tbody');
    tbody.innerHTML = '';
    
    if(globalRecords.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#64748b">No records found.</td></tr>';
        return;
    }

    const today = new Date().toLocaleDateString('en-GB');
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let filtered = globalRecords.filter(r => {
        if(!r['Timestamp']) return false;
        const rDate = new Date(r['Timestamp']);
        if(filter === 'daily') return rDate.toLocaleDateString('en-GB') === today;
        if(filter === 'weekly') return rDate >= oneWeekAgo;
        if(filter === 'monthly') return rDate >= oneMonthAgo;
        return true;
    });

    // Sort newest first
    filtered.sort((a,b) => new Date(b['Timestamp']) - new Date(a['Timestamp']));

    if(filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#64748b">No patients found for this ${filter} period.</td></tr>`;
        return;
    }

    filtered.forEach(r => {
        const tr = document.createElement('tr');
        const rId = r.appointmentId || r['Appointment ID'];
        const rPid = r.patientId || r['Patient ID'] || '-';
        const rName = r.name || r['Name'];
        const rPhone = r.phone || r['Phone'];
        const rWt = r.weight || r['Weight'] || '-';
        const rTime = r['Timestamp'] ? new Date(r['Timestamp']).toLocaleDateString('en-GB') : '-';
        
        const allTime = globalRecords.filter(x => (x.phone || x['Phone']) == rPhone).sort((a,b) => new Date(a['Timestamp']) - new Date(b['Timestamp']));
        let vIndex = allTime.findIndex(x => (x.appointmentId || x['Appointment ID']) === rId);
        const dynamicVisitCount = vIndex >= 0 ? vIndex + 1 : 1;

        tr.innerHTML = `
            <td><strong>${rId}</strong></td>
            <td>${rPid}</td>
            <td>${rName}</td>
            <td>${rPhone}</td>
            <td>${rWt}</td>
            <td style="text-align:center;"><span style="background:var(--blue-100);color:var(--blue-600);padding:2px 8px;border-radius:12px;font-size:0.8rem;font-weight:600;">${dynamicVisitCount}</span></td>
            <td>${rTime}</td>
            <td>
                <button class="btn btn-primary" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;" onclick="printSlip('${rId}')">
                    <i class="ph ph-printer"></i> Print
                </button>
                <button class="btn" style="background:#25D366; color:white; padding: 0.4rem 0.8rem; font-size: 0.85rem; margin-left: 5px; border:none;" onclick="sendWhatsAppFromList('${rId}')">
                    <i class="ph ph-whatsapp-logo"></i> WhatsApp
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function printSlip(apptId) {
    const r = globalRecords.find(x => (x.appointmentId || x['Appointment ID']) === apptId);
    if(!r) return;
    
    let gen = r.gender || r['Gender'] || '';
    if(gen === 'Male') gen = 'M';
    else if(gen === 'Female') gen = 'F';
    else gen = 'O';

    const rDate = r['Timestamp'] ? new Date(r['Timestamp']).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');

    document.getElementById('print-name').textContent = r.name || r['Name'];
    document.getElementById('print-age').textContent = r.age || r['Age'];
    document.getElementById('print-gender').textContent = gen;
    document.getElementById('print-date').textContent = rDate;
    
    document.getElementById('out-phone').textContent = r.phone || r['Phone'];
    document.getElementById('out-pid').textContent = r.patientId || r['Patient ID'] || '-';
    document.getElementById('out-weight').textContent = r.weight || r['Weight'] || '-';
    document.getElementById('out-id').textContent = r.appointmentId || r['Appointment ID'];
    
    const rPhoneForPrint = r.phone || r['Phone'];
    const allVisits = globalRecords.filter(x => (x.phone || x['Phone']) == rPhoneForPrint).sort((a,b) => new Date(a['Timestamp']) - new Date(b['Timestamp']));
    const visitIdx = allVisits.findIndex(x => (x.appointmentId || x['Appointment ID']) === apptId);
    document.getElementById('out-visit').textContent = visitIdx >= 0 ? visitIdx + 1 : 1;
    
    document.getElementById('out-symptoms').textContent = r.symptoms || r['Symptoms'];

    // Navigate to the Prescription View holding the print template
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector('.nav-item[data-target="prescription"]').classList.add('active');
    
    document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
    document.getElementById('prescription').classList.remove('hidden');
    
    document.querySelector('.prescription-form-container').style.display = 'none';
    
    document.getElementById('preview-actions').style.display = 'none';
    document.getElementById('view-actions').style.display = 'block';
    document.getElementById('print-template').style.display = 'block';

    // Trigger print dialog
    setTimeout(() => {
        printCurrentSlip();
    }, 100);
}

function printCurrentSlip() {
    const name = document.getElementById('print-name').textContent || 'Patient';
    const apptId = document.getElementById('out-id').textContent || 'APT';
    const dateStr = document.getElementById('print-date').textContent ? document.getElementById('print-date').textContent.replace(/\//g, '-') : new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
    
    // Changing document title sets the default name when saving print to PDF
    const originalTitle = document.title;
    document.title = `${name}_${apptId}_${dateStr}`;
    
    window.print();
    
    // Restore the title after a small delay
    setTimeout(() => {
        document.title = originalTitle;
    }, 1000);
}

/* Communication Logic */
function triggerWhatsApp(phoneRaw, name, apptId, dateStr) {
    if(!phoneRaw) return;
    let phone = phoneRaw.toString().replace(/\D/g, '');
    if(phone.length === 10) phone = '91' + phone;
    
    const message = `Hello *${name}*,\n\nYour prescription details from the clinic:\n*Appointment ID:* ${apptId}\n*Date:* ${dateStr}\n\nThank you for visiting! We wish you a speedy recovery.`;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
}

function sendWhatsApp() {
    const phone = document.getElementById('out-phone').textContent;
    const name = document.getElementById('print-name').textContent;
    const apptId = document.getElementById('out-id').textContent;
    const dateStr = document.getElementById('print-date').textContent;
    triggerWhatsApp(phone, name, apptId, dateStr);
}

function sendWhatsAppFromList(apptId) {
    const r = globalRecords.find(x => (x.appointmentId || x['Appointment ID']) === apptId);
    if(!r) return;
    const rDate = r['Timestamp'] ? new Date(r['Timestamp']).toLocaleDateString('en-GB') : '';
    triggerWhatsApp(r.phone || r['Phone'], r.name || r['Name'], apptId, rDate);
}
