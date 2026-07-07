// Copyright (c) 2026 Kasper Sjöström. All rights reserved. License: AGPL-3.0 license. www.kswebb.se - Thanks to Gemini for helping me out with this project.
let currentDb = null;

function getPersonClass(person) {
    if (currentDb.participants.leaders.includes(person)) return 'leader';
    if (currentDb.participants.scouts.sparare.includes(person)) return 'sparare';
    if (currentDb.participants.scouts.upptackare.includes(person)) return 'upptackare';
    if (currentDb.participants.scouts.aventyrare.includes(person)) return 'aventyrare';
    if (currentDb.participants.scouts.ledarbarn.includes(person)) return 'ledarbarn';
    return '';
}

async function fetchData() {
    try {
        const response = await fetch('/api/data');
        currentDb = await response.json();
        renderSystem();
        fetchStatus();

        if (typeof updateMapUI === "function") {
            updateMapUI();
        }
    } catch (error) {
        console.error('Kunde inte hämta data:', error);
    }
}

function renderSystem() {
    const tentSelect = document.getElementById('new-tent-type');
    tentSelect.innerHTML = '';
    if (currentDb.inventory) {
        currentDb.inventory.forEach(tent => {
            tentSelect.innerHTML += `<option value="${tent.id}">${tent.name} (Tar ${tent.capacity} pers)</option>`;
        });
    }
    const tentsGrid = document.getElementById('tents-grid');
    const unassignedPool = document.getElementById('unassigned-pool');
    
    tentsGrid.innerHTML = '';
    unassignedPool.innerHTML = '';

    const allParticipants = [
        ...currentDb.participants.leaders,
        ...currentDb.participants.scouts.sparare,
        ...currentDb.participants.scouts.upptackare,
        ...currentDb.participants.scouts.aventyrare,
        ...currentDb.participants.scouts.ledarbarn
    ];

    let placedParticipants = [];

    currentDb.assignments.forEach((assignment, index) => {
        const tentInfo = currentDb.inventory.find(t => t.id === assignment.tentType);
        const tentName = tentInfo ? tentInfo.name : 'Okänt tält';
        
        const card = document.createElement('div');
        card.className = 'tent-card';
        card.ondragover = (e) => e.preventDefault();
        card.setAttribute('ondrop', `handleDrop(event, ${assignment.tentNumber})`);

       let occupantsHtml = '';
        assignment.occupants.forEach(person => {
            placedParticipants.push(person);
            const personClass = getPersonClass(person);
            
            occupantsHtml += `
                <span class="person-tag ${personClass}" 
                      draggable="true" 
                      ondragstart="handleDragStart(event, '${person}', ${index})">
                    ${person}
                    <span style="color: #ffffff; cursor: pointer; margin-left: 6px; font-weight: bold; font-size: 16px;" 
                          onclick="deletePerson('${person}')" 
                          title="Ta bort ${person}">&times;</span>
                </span>`;
        });

        const isEgetBoende = tentName.toLowerCase() === 'eget boende';
        let cardTitle = isEgetBoende ? `Eget boende` : `Tält ${assignment.tentNumber}`;
        if (assignment.customName && !isEgetBoende) {
            cardTitle = assignment.customName;
        }

        const capacity = tentInfo ? tentInfo.capacity : 0;
        const currentCount = assignment.occupants.length;
        const isOverfull = !isEgetBoende && (currentCount > capacity);

        let countText = isEgetBoende 
            ? `Beläggning: ${currentCount} pers` 
            : `Beläggning: ${currentCount} / ${capacity} pers`;

        if (isOverfull) {
            countText = `<span style="color: #d32f2f; font-weight: bold;">⚠️ ${countText} (Överfullt!)</span>`;
        } else {
            countText = `<span style="color: #235726; font-weight: bold;">${countText}</span>`;
        }

        const cardSubtitle = isEgetBoende 
            ? `${countText}` 
            : `(${tentName}) &nbsp;|&nbsp; ${countText}`;

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
                <h3 style="margin: 0; color: var(--scout-dark); display: flex; align-items: center; gap: 8px;">
                    ${cardTitle}
                    ${!isEgetBoende ? `<span style="cursor: pointer; font-size: 14px;" onclick="renameTent(${assignment.tentNumber})" title="Byt namn på tältet">✏️</span>` : ''}
                </h3>
                <span style="color: #c62828; cursor: pointer; font-weight: bold; font-size: 20px; line-height: 1;" 
                      onclick="deleteTent(${assignment.tentNumber})" 
                      title="Ta bort ${cardTitle}">&times;</span>
            </div>
            <span style="font-size: 14px; color: #666; display: block; margin-top: -15px; margin-bottom: 15px;">
                ${cardSubtitle}
            </span>
            <div style="min-height: 40px; padding-bottom: 10px;">${occupantsHtml}</div>
        `;
        tentsGrid.appendChild(card);
    });

    const unassigned = allParticipants.filter(p => !placedParticipants.includes(p));
    
    unassignedPool.ondragover = (e) => e.preventDefault();
    unassignedPool.setAttribute('ondrop', `handleDrop(event, 'pool')`);

    unassigned.forEach(person => {
        const personClass = getPersonClass(person);
        unassignedPool.innerHTML += `
            <span class="person-tag ${personClass}" 
                  draggable="true" 
                  ondragstart="handleDragStart(event, '${person}', -1)">
                ${person}
                <span style="color: #c62828; cursor: pointer; margin-left: 6px; font-weight: bold; font-size: 16px;" 
                      onclick="deletePerson('${person}')" 
                      title="Ta bort ${person}">&times;</span>
            </span>`;
    });
}

function handleDragStart(e, person, fromTentIndex) {
    e.dataTransfer.setData('text/plain', person);
    e.dataTransfer.setData('fromTentIndex', fromTentIndex);
}

async function handleDrop(e, targetTentNumber) {
    e.preventDefault();
    const personName = e.dataTransfer.getData('text/plain');
    
    if (!personName) return;

    const targetAssignment = currentDb.assignments.find(a => a.tentNumber === parseInt(targetTentNumber));
    
    if (targetTentNumber === 'pool') {
        currentDb.assignments.forEach(a => {
            const idx = a.occupants.indexOf(personName);
            if (idx !== -1) a.occupants.splice(idx, 1);
        });
    } else if (targetAssignment) {
        if (!targetAssignment.occupants.includes(personName)) {
            currentDb.assignments.forEach(a => {
                const idx = a.occupants.indexOf(personName);
                if (idx !== -1) a.occupants.splice(idx, 1);
            });
            targetAssignment.occupants.push(personName);
        }
    }

    try {
        await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentDb)
        });
        fetchData();
    } catch (error) {
        console.error("Kunde inte spara efter drag-and-drop:", error);
    }
}

async function fetchStatus() {
    try {
        const response = await fetch('/api/status');
        const status = await response.json();

        if (status.version && document.getElementById('app-version')) {
            document.getElementById('app-version').innerText = 'Systemversion ' + status.version;
        }
        
        const statusContainer = document.getElementById('status-container');
        statusContainer.className = 'status-box ' + (status.isEnough ? 'status-success' : 'status-warning');
        statusContainer.innerHTML = `
            ${status.message}<br>
            <span style="font-weight:normal; font-size: 14px; color: #1A421A;">
                Kapacitet: ${status.totalCapacity} | Deltagare: ${status.totalPeople}
            </span>
        `;
    } catch (error) {
        console.error('Kunde inte hämta status:', error);
    }
}

async function addPerson() {
    const nameInput = document.getElementById('new-person-name');
    const groupSelect = document.getElementById('new-person-group');
    const name = nameInput.value.trim();
    const group = groupSelect.value;

    if (!name) {
        alert('Du måste skriva in ett namn!');
        return;
    }

    try {
        await fetch('/api/participants', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, group })
        });
        nameInput.value = '';
        fetchData();
    } catch (error) {
        console.error("Kunde inte lägga till person:", error);
    }
}

async function deletePerson(name) {
    if (!confirm(`Är du helt säker på att du vill ta bort ${name} från lägret?`)) return;

    try {
        await fetch('/api/participants', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        fetchData();
    } catch (error) {
        console.error("Kunde inte ta bort personen:", error);
    }
}

async function addTent() {
    const tentType = document.getElementById('new-tent-type').value;
    if (!tentType) return;

    try {
        await fetch('/api/tents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tentType })
        });
        fetchData();
    } catch (error) {
        console.error("Kunde inte lägga till tält:", error);
    }
}

async function renameTent(tentNumber) {
    const tent = currentDb.assignments.find(t => t.tentNumber === tentNumber);
    const currentName = tent.customName || '';

    const newName = prompt("Vad vill du döpa tältet till? (t.ex. 'Äventyrare' eller 'Mattältet').\nLämna tomt och spara om du vill återställa till 'Tält " + tentNumber + "'.", currentName);
    
    if (newName !== null) {
        try {
            const response = await fetch(`/api/tents/${tentNumber}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customName: newName.trim() })
            });
            const result = await response.json();
            if (result.success) fetchData();
        } catch (error) {
            console.error("Fel vid namnbyte:", error);
        }
    }
}

async function deleteTent(tentNumber) {
    if (!confirm(`Är du helt säker på att du vill ta bort Tält ${tentNumber}? Alla deltagare i tältet kommer att bli oplacerade.`)) return;

    try {
        await fetch('/api/tents', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tentNumber })
        });
        fetchData();
    } catch (error) {
        console.error("Kunde inte ta bort tältet:", error);
    }
}

function toggleInventory() {
    const section = document.getElementById('inventory-section');
    if (section.style.display === 'none') {
        section.style.display = 'block';
        renderInventory();
    } else {
        section.style.display = 'none';
    }
}

function renderInventory() {
    const list = document.getElementById('inventory-list');
    list.innerHTML = '';

    currentDb.inventory.forEach((tent, index) => {
        const w = tent.width || 4;
        const l = tent.length || w;
        const shapeText = tent.shape === 'rectangle' ? `Fyrkantigt (${w}x${l}m)` : `Runt (Ø ${w}m)`;

        list.innerHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; background: white; padding: 10px; margin-bottom: 8px; border-radius: 4px; border: 1px solid #ddd;">
                <div>
                    <strong>${tent.name}</strong> <span style="color: #666; font-size: 14px;">(ID: ${tent.id})</span><br>
                    <span style="font-size: 14px;">Kapacitet: ${tent.capacity} pers | Kåren äger: ${tent.quantityOwned} st<br>Form: <b>${shapeText}</b></span>
                </div>
                <div>
                    <button onclick="editInventoryTent(${index})" style="background: #fb8c00; padding: 6px 12px; font-size: 12px; margin-right: 5px;">✏️ Ändra</button>
                    <button onclick="deleteInventoryTent(${index})" style="background: #e53935; padding: 6px 12px; font-size: 12px;">✖ Ta bort</button>
                </div>
            </div>
        `;
    });
}

async function saveInventory() {
    try {
        await fetch('/api/inventory', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentDb.inventory)
        });
        fetchData(); 
        setTimeout(renderInventory, 100); 
    } catch (error) {
        console.error("Kunde inte spara tältlagret:", error);
    }
}

function addInventoryTent() {
    const id = document.getElementById('inv-id').value.trim();
    const name = document.getElementById('inv-name').value.trim();
    const capacity = parseInt(document.getElementById('inv-cap').value);
    const qty = parseInt(document.getElementById('inv-qty').value);
    
    const shape = document.getElementById('inv-shape').value;
    const width = parseFloat(document.getElementById('inv-width').value.replace(',', '.'));
    let length = parseFloat(document.getElementById('inv-length').value.replace(',', '.'));

    if (!id || !name || isNaN(capacity) || isNaN(qty) || isNaN(width)) {
        alert("Fyll i alla fält korrekt! (Bredd/Diameter måste anges)");
        return;
    }

    if (shape === 'rectangle' && isNaN(length)) {
        alert("För ett fyrkantigt tält måste du ange både bredd och längd.");
        return;
    }

    if (shape === 'circle') length = width;

    if (currentDb.inventory.find(t => t.id === id)) {
        alert("En tälttyp med det ID:t finns redan.");
        return;
    }

    currentDb.inventory.push({ id, name, capacity, quantityOwned: qty, shape, width, length });
    saveInventory();

    document.getElementById('inv-id').value = '';
    document.getElementById('inv-name').value = '';
    document.getElementById('inv-cap').value = '';
    document.getElementById('inv-qty').value = '';
    document.getElementById('inv-width').value = '';
    document.getElementById('inv-length').value = '';
}

function deleteInventoryTent(index) {
    const tent = currentDb.inventory[index];
    
    const isInUse = currentDb.assignments.some(a => a.tentType === tent.id);
    if (isInUse) {
        alert(`Du kan inte ta bort ${tent.name} eftersom det finns uppslagna tält av den typen på lägret. Ta bort tälten från lägret först!`);
        return;
    }

    if (confirm(`Är du säker på att du vill ta bort tälttypen ${tent.name}?`)) {
        currentDb.inventory.splice(index, 1);
        saveInventory();
    }
}

function editInventoryTent(index) {
    const tent = currentDb.inventory[index];
    
    const newName = prompt(`Ändra namn (nuvarande: ${tent.name}):`, tent.name);
    if (newName === null) return;
    
    const newCap = prompt(`Ändra kapacitet för ${newName}:`, tent.capacity);
    if (newCap === null) return;
    
    const newQty = prompt(`Hur många ${newName} äger kåren?`, tent.quantityOwned);
    if (newQty === null) return;

    const isRect = tent.shape === 'rectangle';
    const newShapeStr = prompt(`Ange form (Skriv 'R' för Runt eller 'F' för Fyrkantigt):`, isRect ? 'F' : 'R');
    if (newShapeStr === null) return;
    const newShape = newShapeStr.toLowerCase().startsWith('f') ? 'rectangle' : 'circle';

    const newWidth = prompt(`Ange ${newShape === 'rectangle' ? 'bredd' : 'diameter'} i meter (t.ex. 4.5):`, tent.width || 4);
    if (newWidth === null) return;

    let newLength = tent.length || 4;
    if (newShape === 'rectangle') {
        const inputLength = prompt(`Ange längd i meter:`, tent.length || 4);
        if (inputLength === null) return;
        newLength = parseFloat(inputLength.replace(',', '.'));
    } else {
        newLength = parseFloat(newWidth.replace(',', '.'));
    }

    currentDb.inventory[index].name = newName.trim() || tent.name;
    currentDb.inventory[index].capacity = parseInt(newCap) || tent.capacity;
    currentDb.inventory[index].quantityOwned = parseInt(newQty) || tent.quantityOwned;
    currentDb.inventory[index].shape = newShape;
    currentDb.inventory[index].width = parseFloat(newWidth.replace(',', '.'));
    currentDb.inventory[index].length = newLength;
    
    saveInventory();
}

async function autoAssign() {
    if (!confirm("Vill du att systemet automatiskt ska placera ut alla oplacerade scouter i lediga tält (sorterat per åldersgrupp)?")) return;

    try {
        const response = await fetch('/api/auto-assign', { method: 'POST' });
        const result = await response.json();
        if (result.success) fetchData();
    } catch (error) {
        console.error("Kunde inte auto-fördela:", error);
    }
}

async function clearAssignments() {
    if (!confirm("Är du säker på att du vill tömma alla tält? Inga scouter eller tält kommer att raderas, men alla måste placeras ut på nytt.")) return;

    try {
        const response = await fetch('/api/clear-assignments', { method: 'POST' });
        const result = await response.json();
        if (result.success) fetchData();
    } catch (error) {
        console.error("Kunde inte tömma tälten:", error);
    }
}

let canvas, ctx;
let mapImage = new Image();
let draggingTent = null;
let mapMetersWidth = 100; 

let isCalibrating = false;
let calibStart = null;
let calibEnd = null;

function switchView(view) {
    const btnList = document.getElementById('btn-list-view');
    const btnMap = document.getElementById('btn-map-view');

    if (view === 'list') {
        document.getElementById('list-view-container').style.display = 'block';
        document.getElementById('map-view-container').style.display = 'none';
        
        btnList.classList.add('active-view-btn');
        btnMap.classList.remove('active-view-btn');
    } else {
        document.getElementById('list-view-container').style.display = 'none';
        document.getElementById('map-view-container').style.display = 'block';
        
        btnList.classList.remove('active-view-btn');
        btnMap.classList.add('active-view-btn');
        
        if (!canvas) initCanvas();
        updateMapUI();
    }
}

function initCanvas() {
    canvas = document.getElementById('camp-map');
    ctx = canvas.getContext('2d');

    canvas.onmousedown = mapDragStart;
    canvas.onmousemove = mapDragMove;
    window.onmouseup = mapDragEnd; 

    canvas.ontouchstart = mapDragStart;
    canvas.ontouchmove = mapDragMove;
    window.ontouchend = mapDragEnd;
}

function startCalibration() {
    if (!currentDb || !currentDb.mapConfig || !currentDb.mapConfig.hasMap) {
        alert("Du måste ladda upp en kartbild först!");
        return;
    }
    
    if (isCalibrating) {
        isCalibrating = false;
        canvas.style.cursor = 'grab';
        document.getElementById('btn-calibrate').style.backgroundColor = '#0288d1';
        document.getElementById('btn-calibrate').innerText = '📐 Kalibrera karta';
        calibStart = null;
        calibEnd = null;
        drawMap();
        return;
    }
    
    isCalibrating = true;
    calibStart = null;
    calibEnd = null;
    canvas.style.cursor = 'crosshair';
    document.getElementById('btn-calibrate').style.backgroundColor = '#d32f2f';
    document.getElementById('btn-calibrate').innerText = 'Avbryt kalibrering';
}

function updateMapUI() {
    if (!currentDb) return;

    const mapConf = currentDb.mapConfig || { hasMap: false, scaleLineMeters: 100, safetyMarginMeters: 4 };
    document.getElementById('map-width').value = mapConf.scaleLineMeters;
    document.getElementById('map-safety').value = mapConf.safetyMarginMeters;
    mapMetersWidth = parseFloat(mapConf.scaleLineMeters);

    const unplacedDiv = document.getElementById('unplaced-tents');
    unplacedDiv.innerHTML = '';

    currentDb.assignments.forEach(tent => {
        const inv = currentDb.inventory.find(i => i.id === tent.tentType);
        if (inv && inv.name.toLowerCase() === 'eget boende') return;

        if (!tent.isPlaced) {
            unplacedDiv.innerHTML += `
                <div style="background: #f1f8e9; border: 1px solid #c5e1a5; padding: 10px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
                    <strong>${tent.tentNumber} ${tent.customName ? `(${tent.customName})` : ''}</strong>
                    <button onclick="placeTentOnMap(${tent.tentNumber})" style="padding: 6px 12px; margin: 0; font-size: 12px; width: auto;">In på karta 📍</button>
                </div>
            `;
        } else {
            unplacedDiv.innerHTML += `
                 <div style="background: #eceff1; border: 1px solid #cfd8dc; padding: 10px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; opacity: 0.7; flex-wrap: wrap; gap: 5px;">
                    <span>✅ ${tent.customName || tent.tentNumber}</span>
                    <div style="display: flex; gap: 5px;">
                        <button onclick="rotateTentOnMap(${tent.tentNumber})" style="padding: 6px 12px; margin: 0; font-size: 12px; width: auto; background-color: #0288d1; color: #000000;">Vänd 🔄</button>
                        <button onclick="removeTentFromMap(${tent.tentNumber})" style="padding: 6px 12px; margin: 0; font-size: 12px; width: auto; background-color: #d32f2f;">Ta bort ❌</button>
                    </div>
                </div>
            `;
        }
    });

    if (mapConf.hasMap && mapConf.imagePath) {
        mapImage.src = mapConf.imagePath + '?t=' + new Date().getTime();
        mapImage.onload = () => {
            if (canvas) {
                const aspectRatio = mapImage.height / mapImage.width;
                canvas.height = canvas.width * aspectRatio;
            }
            drawMap();
        };
    } else {
        drawMap();
    }
}

function drawMap() {
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (currentDb && currentDb.mapConfig && currentDb.mapConfig.hasMap) {
        ctx.drawImage(mapImage, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = '#cfd8dc';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#455a64';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText("Ingen kartbild uppladdad ännu.", canvas.width / 2, canvas.height / 2);
    }

    if (!currentDb) return;

    const pixelsPerMeter = canvas.width / mapMetersWidth;
    const safetyMargin = parseFloat(currentDb.mapConfig.safetyMarginMeters) || 4;
    const placedTents = currentDb.assignments.filter(t => t.isPlaced);

    placedTents.forEach((tent, i) => {
        const inv = currentDb.inventory.find(item => item.id === tent.tentType);
        
        const shape = inv ? (inv.shape || 'circle') : 'circle';
        let widthM = inv ? (inv.width || 4.0) : 4.0;
        let lengthM = inv ? (inv.length || 4.0) : 4.0;
        
        if (tent.isRotated) {
            const temp = widthM;
            widthM = lengthM;
            lengthM = temp;
        }
        
        const wPx = widthM * pixelsPerMeter;
        const lPx = lengthM * pixelsPerMeter;
        
        const haloWPx = (widthM + safetyMargin) * pixelsPerMeter;
        const haloLPx = (lengthM + safetyMargin) * pixelsPerMeter;

        const pxX = (tent.x / 100) * canvas.width;
        const pxY = (tent.y / 100) * canvas.height;

        let isColliding = false;
        for (let j = 0; j < placedTents.length; j++) {
            if (i === j) continue;
            const other = placedTents[j];
            const otherInv = currentDb.inventory.find(item => item.id === other.tentType);
            
            const oShape = otherInv ? (otherInv.shape || 'circle') : 'circle';
            let oWidthM = otherInv ? (otherInv.width || 4.0) : 4.0;
            let oLengthM = otherInv ? (otherInv.length || 4.0) : 4.0;
            
            if (other.isRotated) {
                const temp = oWidthM;
                oWidthM = oLengthM;
                oLengthM = temp;
            }
            
            const oHaloWPx = (oWidthM + safetyMargin) * pixelsPerMeter;
            const oHaloLPx = (oLengthM + safetyMargin) * pixelsPerMeter;
            
            const oPx = (other.x / 100) * canvas.width;
            const oPy = (other.y / 100) * canvas.height;

            if (pxX - haloWPx/2 < oPx + oHaloWPx/2 &&
                pxX + haloWPx/2 > oPx - oHaloWPx/2 &&
                pxY - haloLPx/2 < oPy + oHaloLPx/2 &&
                pxY + haloLPx/2 > oPy - oHaloLPx/2) {
                
                if (shape === 'circle' && oShape === 'circle') {
                    const dist = Math.sqrt(Math.pow(pxX - oPx, 2) + Math.pow(pxY - oPy, 2));
                    if (dist < (haloWPx/2 + oHaloWPx/2)) {
                        isColliding = true;
                        break;
                    }
                } else {
                    isColliding = true; 
                    break;
                }
            }
        }

        ctx.beginPath();
        if (shape === 'rectangle') {
            ctx.rect(pxX - haloWPx/2, pxY - haloLPx/2, haloWPx, haloLPx);
        } else {
            ctx.arc(pxX, pxY, haloWPx/2, 0, 2 * Math.PI);
        }
        ctx.fillStyle = isColliding ? 'rgba(244, 67, 54, 0.4)' : 'rgba(255, 193, 7, 0.3)';
        ctx.fill();
        ctx.strokeStyle = isColliding ? '#d32f2f' : '#ffa000';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        if (shape === 'rectangle') {
            ctx.rect(pxX - wPx/2, pxY - lPx/2, wPx, lPx);
        } else {
            ctx.arc(pxX, pxY, wPx/2, 0, 2 * Math.PI);
        }
        ctx.fillStyle = draggingTent === tent.tentNumber ? '#1976d2' : '#388e3c';
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = 'white';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tent.customName || tent.tentNumber, pxX, pxY);
    });

    if (calibStart && calibEnd) {
        ctx.beginPath();
        ctx.moveTo(calibStart.x, calibStart.y);
        ctx.lineTo(calibEnd.x, calibEnd.y);
        ctx.strokeStyle = '#f44336'; 
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(calibStart.x, calibStart.y, 6, 0, 2*Math.PI);
        ctx.arc(calibEnd.x, calibEnd.y, 6, 0, 2*Math.PI);
        ctx.fillStyle = '#f44336';
        ctx.fill();
    }
}

function getMousePos(evt) {
    const rect = canvas.getBoundingClientRect();
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
    
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
}

function mapDragStart(e) {
    if (!currentDb) return;
    const pos = getMousePos(e);

    if (isCalibrating) {
        calibStart = pos;
        calibEnd = pos;
        if (e.touches) e.preventDefault();
        return;
    }

    const pixelsPerMeter = canvas.width / mapMetersWidth;
    currentDb.assignments.filter(t => t.isPlaced).forEach(tent => {
        const inv = currentDb.inventory.find(i => i.id === tent.tentType);
        
        const maxDimMeters = inv ? Math.max((inv.width || 4.0), (inv.length || 4.0)) : 4.0;
        const tentClickRadiusPx = (maxDimMeters / 2) * pixelsPerMeter; 
        
        const pxX = (tent.x / 100) * canvas.width;
        const pxY = (tent.y / 100) * canvas.height;

        const dist = Math.sqrt(Math.pow(pos.x - pxX, 2) + Math.pow(pos.y - pxY, 2));
        if (dist <= tentClickRadiusPx) {
            draggingTent = tent.tentNumber;
            canvas.style.cursor = 'grabbing';
            if (e.touches) e.preventDefault();
        }
    });
}

function mapDragMove(e) {
    if (isCalibrating && calibStart) {
        calibEnd = getMousePos(e);
        drawMap(); 
        if (e.touches) e.preventDefault();
        return;
    }

    if (!draggingTent || !currentDb) return;
    if (e.touches) e.preventDefault(); 
    
    const pos = getMousePos(e);
    const tent = currentDb.assignments.find(t => t.tentNumber === draggingTent);
    
    let newX = (pos.x / canvas.width) * 100;
    let newY = (pos.y / canvas.height) * 100;
    newX = Math.max(0, Math.min(100, newX));
    newY = Math.max(0, Math.min(100, newY));

    tent.x = newX;
    tent.y = newY;
    
    drawMap(); 
}

async function mapDragEnd(e) {
    if (isCalibrating && calibStart && calibEnd) {
        const distPx = Math.sqrt(Math.pow(calibEnd.x - calibStart.x, 2) + Math.pow(calibEnd.y - calibStart.y, 2));

        isCalibrating = false;
        canvas.style.cursor = 'grab';
        document.getElementById('btn-calibrate').style.backgroundColor = '#0288d1';
        document.getElementById('btn-calibrate').innerText = '📐 Kalibrera karta';

        if (distPx > 10) {
            const metersStr = prompt("Hur många meter är den röda linjen i verkligheten? (t.ex. '15')");
            if (metersStr && !isNaN(parseFloat(metersStr.replace(',', '.')))) {
                const meters = parseFloat(metersStr.replace(',', '.'));
                
                const totalMapMeters = (canvas.width / distPx) * meters;
                document.getElementById('map-width').value = totalMapMeters;
                
                await updateMapSettings();
                alert(`Skalan inställd! Kartan är nu kalibrerad till ${Math.round(totalMapMeters)} meter bred.`);
            }
        }
        calibStart = null;
        calibEnd = null;
        drawMap();
        return;
    } else if (isCalibrating) {
        isCalibrating = false;
        canvas.style.cursor = 'grab';
        document.getElementById('btn-calibrate').style.backgroundColor = '#0288d1';
        document.getElementById('btn-calibrate').innerText = '📐 Kalibrera karta';
        return;
    }

    if (!draggingTent || !currentDb) return;
    const tent = currentDb.assignments.find(t => t.tentNumber === draggingTent);
    const number = draggingTent;
    draggingTent = null;
    canvas.style.cursor = 'grab';

    await fetch(`/api/tents/position/${number}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: tent.x, y: tent.y, isPlaced: true, isRotated: tent.isRotated })
    });
}

async function uploadMap(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        await fetch('/api/map/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: e.target.result })
        });
        fetchData();
    };
    reader.readAsDataURL(file);
}

async function updateMapSettings() {
    const width = document.getElementById('map-width').value;
    const margin = document.getElementById('map-safety').value;
    await fetch('/api/map/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scaleLineMeters: width, safetyMarginMeters: margin })
    });
    fetchData();
}

async function placeTentOnMap(tentNumber) {
    await fetch(`/api/tents/position/${tentNumber}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: 50, y: 50, isPlaced: true }) 
    });
    fetchData();
}

async function removeTentFromMap(tentNumber) {
    await fetch(`/api/tents/position/${tentNumber}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: null, y: null, isPlaced: false })
    });
    fetchData();
}

async function rotateTentOnMap(tentNumber) {
    const tent = currentDb.assignments.find(t => t.tentNumber === tentNumber);
    if (!tent) return;
    
    tent.isRotated = !tent.isRotated;
    
    await fetch(`/api/tents/position/${tentNumber}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: tent.x, y: tent.y, isPlaced: true, isRotated: tent.isRotated })
    });
    fetchData();
}

fetchData();