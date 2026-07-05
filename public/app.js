let currentDb = null;

function getPersonClass(person) {
    if (currentDb.participants.leaders.includes(person)) return 'leader';
    if (currentDb.participants.scouts.sparare.includes(person)) return 'sparare';
    if (currentDb.participants.scouts.upptackare.includes(person)) return 'upptackare';
    if (currentDb.participants.scouts.aventyrare.includes(person)) return 'aventyrare';
    return '';
}

async function fetchData() {
    try {
        const response = await fetch('/api/data');
        currentDb = await response.json();
        renderSystem();
        fetchStatus();
    } catch (error) {
        console.error('Kunde inte hämta data:', error);
    }
}

function renderSystem() {
    // Fyll dropdown-menyn för tält (bara om den är tom)
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

    // 1. Samla alla deltagare i en enda lista för att se vilka som finns
    const allParticipants = [
        ...currentDb.participants.leaders,
        ...currentDb.participants.scouts.sparare,
        ...currentDb.participants.scouts.upptackare,
        ...currentDb.participants.scouts.aventyrare
    ];

    let placedParticipants = [];

    // 2. Rendera Tälten
    currentDb.assignments.forEach((assignment, index) => {
        const tentInfo = currentDb.inventory.find(t => t.id === assignment.tentType);
        const tentName = tentInfo ? tentInfo.name : 'Okänt tält';
        
        const card = document.createElement('div');
        card.className = 'tent-card';
        // Gör tältet till en drop-zone
        card.ondragover = (e) => e.preventDefault();
        card.ondrop = (e) => handleDrop(e, index);

        let occupantsHtml = '';
        assignment.occupants.forEach(person => {
            placedParticipants.push(person);
            const isLeader = currentDb.participants.leaders.includes(person);
            
            // Gör varje person dragbar
            occupantsHtml += `
                <span class="person-tag ${isLeader ? 'leader' : ''}" 
                      draggable="true" 
                      ondragstart="handleDragStart(event, '${person}', ${index})">
                    ${person}
                    <span style="color: #c62828; cursor: pointer; margin-left: 6px; font-weight: bold; font-size: 16px;" 
                          onclick="deletePerson('${person}')" 
                          title="Ta bort ${person}">&times;</span>
                </span>`;
        });

        // Kolla om det är ett vanligt tält eller "Eget boende"
        const isEgetBoende = tentName.toLowerCase() === 'eget boende';
        
        // Välj rubrik: Om tältet har ett eget namn används det, annars "Tält X"
        let cardTitle = isEgetBoende ? `Eget boende` : `Tält ${assignment.tentNumber}`;
        if (assignment.customName && !isEgetBoende) {
            cardTitle = assignment.customName;
        }

        const cardSubtitle = isEgetBoende 
            ? `` 
            : `(${tentName} - Max ${tentInfo ? tentInfo.capacity : '?'})`;

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

    // 3. Rendera Oplacerade
    const unassigned = allParticipants.filter(p => !placedParticipants.includes(p));
    
    // Gör "Oplacerade"-rutan till en drop-zone (-1 betyder att de lämnar ett tält)
    unassignedPool.ondragover = (e) => e.preventDefault();
    unassignedPool.ondrop = (e) => handleDrop(e, -1);

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
    // Spara vem vi drar och varifrån
    e.dataTransfer.setData('person', person);
    e.dataTransfer.setData('fromTentIndex', fromTentIndex);
}

async function handleDrop(e, toTentIndex) {
    e.preventDefault();
    const person = e.dataTransfer.getData('person');
    const fromTentIndex = parseInt(e.dataTransfer.getData('fromTentIndex'));

    // Om vi släpper på samma ställe som vi startade, gör ingenting
    if (fromTentIndex === toTentIndex) return;

    // 1. Ta bort personen från det gamla tältet
    if (fromTentIndex !== -1) {
        currentDb.assignments[fromTentIndex].occupants = currentDb.assignments[fromTentIndex].occupants.filter(p => p !== person);
    }

    // 2. Lägg till personen i det nya tältet
    if (toTentIndex !== -1) {
        currentDb.assignments[toTentIndex].occupants.push(person);
    }

    // 3. Rita om skärmen direkt så det känns snabbt för användaren
    renderSystem();

    // 4. Spara till servern
    try {
        await fetch('/api/assignments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentDb.assignments)
        });
    } catch (error) {
        console.error("Kunde inte spara ändringen!", error);
    }
}

async function fetchStatus() {
    try {
        const response = await fetch('/api/status');
        const status = await response.json();
        
        const statusContainer = document.getElementById('status-container');
        statusContainer.className = 'status-box ' + (status.isEnough ? 'status-success' : 'status-warning');
        statusContainer.innerHTML = `
            ${status.message}<br>
            <span style="font-weight:normal; font-size: 14px;">
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
        
        // Rensa fältet och ladda om sidan
        nameInput.value = '';
        fetchData();
    } catch (error) {
        console.error("Kunde inte lägga till person:", error);
    }
}

async function deletePerson(name) {
    // Fråga först så att man inte klickar fel av misstag
    if (!confirm(`Är du helt säker på att du vill ta bort ${name} från lägret?`)) {
        return;
    }

    try {
        await fetch('/api/participants', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        
        // Uppdatera gränssnittet när borttagningen är klar
        fetchData();
    } catch (error) {
        console.error("Kunde inte ta bort personen:", error);
        alert("Ett fel uppstod när personen skulle tas bort.");
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
    // Hitta tältets nuvarande namn om det har ett
    const tent = currentDb.assignments.find(t => t.tentNumber === tentNumber);
    const currentName = tent.customName || '';

    const newName = prompt("Vad vill du döpa tältet till? (t.ex. 'Äventyrare' eller 'Mattältet').\nLämna tomt och spara om du vill återställa till 'Tält " + tentNumber + "'.", currentName);
    
    // Om användaren klickade avbryt är newName null, då gör vi inget.
    if (newName !== null) {
        try {
            const response = await fetch(`/api/tents/${tentNumber}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customName: newName.trim() })
            });
            const result = await response.json();
            
            if (result.success) {
                fetchData(); // Ladda om listan!
            } else {
                alert("Kunde inte byta namn.");
            }
        } catch (error) {
            console.error("Fel vid namnbyte:", error);
        }
    }
}

async function deleteTent(tentNumber) {
    // Varna användaren eftersom scouter kommer att flyttas
    if (!confirm(`Är du helt säker på att du vill ta bort Tält ${tentNumber}? Alla deltagare i tältet kommer att bli oplacerade.`)) {
        return;
    }

    try {
        await fetch('/api/tents', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tentNumber })
        });
        
        // Ladda om all data och rita om skärmen
        fetchData();
    } catch (error) {
        console.error("Kunde inte ta bort tältet:", error);
        alert("Ett fel uppstod när tältet skulle tas bort.");
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
        list.innerHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; background: white; padding: 10px; margin-bottom: 8px; border-radius: 4px; border: 1px solid #ddd;">
                <div>
                    <strong>${tent.name}</strong> <span style="color: #666; font-size: 14px;">(ID: ${tent.id})</span><br>
                    <span style="font-size: 14px;">Kapacitet: ${tent.capacity} pers | Kåren äger: ${tent.quantityOwned} st</span>
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
        fetchData(); // Ladda om all data
        setTimeout(renderInventory, 100); // Uppdatera rutan efter datan laddats om
    } catch (error) {
        console.error("Kunde inte spara tältlagret:", error);
    }
}

function addInventoryTent() {
    const id = document.getElementById('inv-id').value.trim();
    const name = document.getElementById('inv-name').value.trim();
    const capacity = parseInt(document.getElementById('inv-cap').value);
    const qty = parseInt(document.getElementById('inv-qty').value);

    if (!id || !name || isNaN(capacity) || isNaN(qty)) {
        alert("Fyll i alla fält korrekt!");
        return;
    }

    // Kolla så ID:t inte redan finns
    if (currentDb.inventory.find(t => t.id === id)) {
        alert("En tälttyp med det ID:t finns redan. Välj ett annat ID.");
        return;
    }

    currentDb.inventory.push({ id, name, capacity, quantityOwned: qty });
    saveInventory();

    // Rensa fälten
    document.getElementById('inv-id').value = '';
    document.getElementById('inv-name').value = '';
    document.getElementById('inv-cap').value = '';
    document.getElementById('inv-qty').value = '';
}

function deleteInventoryTent(index) {
    const tent = currentDb.inventory[index];
    
    // Säkerhetskontroll: Kolla om det redan finns uppslagna tält av denna typ på lägret
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
    
    // Vi använder enkla prompts för snabb redigering
    const newName = prompt(`Ändra namn på tältet (nuvarande: ${tent.name}):`, tent.name);
    if (newName === null) return; // Användaren avbröt
    
    const newCap = prompt(`Ändra kapacitet för ${newName}:`, tent.capacity);
    if (newCap === null) return;
    
    const newQty = prompt(`Hur många ${newName} äger kåren?`, tent.quantityOwned);
    if (newQty === null) return;

    // Spara de nya värdena
    currentDb.inventory[index].name = newName.trim() || tent.name;
    currentDb.inventory[index].capacity = parseInt(newCap) || tent.capacity;
    currentDb.inventory[index].quantityOwned = parseInt(newQty) || tent.quantityOwned;
    
    saveInventory();
}

async function autoAssign() {
    if (!confirm("Vill du att systemet automatiskt ska placera ut alla oplacerade scouter i lediga tält (sorterat per åldersgrupp)?")) {
        return;
    }

    try {
        const response = await fetch('/api/auto-assign', { method: 'POST' });
        const result = await response.json();
        
        if (result.success) {
            // Ladda om skärmen så vi ser den nya fördelningen
            fetchData();
        } else {
            alert("Något gick fel vid auto-fördelningen.");
        }
    } catch (error) {
        console.error("Kunde inte auto-fördela:", error);
    }
}

async function clearAssignments() {
    // Säkerhetsfråga så man inte klickar fel av misstag
    if (!confirm("Är du säker på att du vill tömma alla tält? Inga scouter eller tält kommer att raderas, men alla måste placeras ut på nytt.")) {
        return;
    }

    try {
        const response = await fetch('/api/clear-assignments', { method: 'POST' });
        const result = await response.json();
        
        if (result.success) {
            // Ladda om skärmen så vi ser att alla hamnar i oplacerade
            fetchData();
        } else {
            alert("Något gick fel vid nollställningen.");
        }
    } catch (error) {
        console.error("Kunde inte tömma tälten:", error);
    }
}

fetchData();