const express = require('express');
const fs = require('fs');
const path = require('path');
const generatePDF = require('./pdfGenerator');

const app = express();
app.use(express.json());

app.use(express.static('public'));

app.get('/api/data', (req, res) => {
    res.json(getDb());
});

app.post('/api/assignments', (req, res) => {
    const db = getDb();
    
    // req.body innehåller den nya arrayen med tältindelningar som vi skickar från webbsidan
    db.assignments = req.body; 
    
    // Spara ner det till vår fil
    const dbPath = path.join(__dirname, 'data.json');
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
    
    res.json({ success: true, message: "Tältindelning sparad!" });
});

app.post('/api/participants', (req, res) => {
    try {
        const db = getDb();
        const { name, group } = req.body;
        
        // Lägg in personen i rätt array
        if (group === 'leaders') {
            db.participants.leaders.push(name);
        } else {
            db.participants.scouts[group].push(name);
        }
        
        const dbPath = path.join(__dirname, 'data.json');
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/participants', (req, res) => {
    try {
        const db = getDb();
        const { name } = req.body;

        if (!name) return res.status(400).json({ error: "Namn saknas" });

        // 1. Ta bort från grundlistorna
        db.participants.leaders = db.participants.leaders.filter(p => p !== name);
        for (const group in db.participants.scouts) {
            db.participants.scouts[group] = db.participants.scouts[group].filter(p => p !== name);
        }

        // 2. Ta bort från tälten om de redan var inlagda där
        db.assignments.forEach(assignment => {
            assignment.occupants = assignment.occupants.filter(p => p !== name);
        });

        // Spara ändringarna
        const dbPath = path.join(__dirname, 'data.json');
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/tents', (req, res) => {
    try {
        const db = getDb();
        const { tentType } = req.body;
        
        // Hitta nästa lediga tältnummer
        const nextNumber = db.assignments.length > 0 
            ? Math.max(...db.assignments.map(a => a.tentNumber)) + 1 
            : 1;

        // Skapa ett nytt tomt tält
        db.assignments.push({
            tentType: tentType,
            tentNumber: nextNumber,
            occupants: []
        });
        
        const dbPath = path.join(__dirname, 'data.json');
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/tents/:number', (req, res) => {
    try {
        const db = getDb();
        const tentNumber = parseInt(req.params.number);
        const { customName } = req.body;

        const tent = db.assignments.find(t => t.tentNumber === tentNumber);
        if (tent) {
            tent.customName = customName; // Spara det nya namnet
            const dbPath = path.join(__dirname, 'data.json');
            fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, error: "Tältet hittades inte" });
        }
    } catch (error) {
        console.error("[ERROR] Kunde inte byta namn:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/auto-assign', (req, res) => {
    try {
        const db = getDb();

        // Hjälpfunktion för att ta reda på vilken grupp en person tillhör
        function getGroup(name) {
            if (db.participants.leaders.includes(name)) return 'leaders';
            if (db.participants.scouts.sparare.includes(name)) return 'sparare';
            if (db.participants.scouts.upptackare.includes(name)) return 'upptackare';
            if (db.participants.scouts.aventyrare.includes(name)) return 'aventyrare';
            return null;
        }

        // 1. Skapa en lista över alla som redan har en plats
        let placed = new Set();
        db.assignments.forEach(tent => tent.occupants.forEach(p => placed.add(p)));

        // 2. Samla alla som är OPLACERADE, uppdelat per grupp
        let unassigned = { leaders: [], sparare: [], upptackare: [], aventyrare: [] };
        
        db.participants.leaders.forEach(p => { if (!placed.has(p)) unassigned.leaders.push(p); });
        ['sparare', 'upptackare', 'aventyrare'].forEach(group => {
            if (db.participants.scouts[group]) {
                db.participants.scouts[group].forEach(p => { if (!placed.has(p)) unassigned[group].push(p); });
            }
        });

        const groupsToAssign = ['leaders', 'sparare', 'upptackare', 'aventyrare'];

        // 3. Fördela grupperna en och en
        groupsToAssign.forEach(group => {
            let peopleToPlace = unassigned[group];
            
            db.assignments.forEach(tent => {
                const tentInfo = db.inventory.find(t => t.id === tent.tentType);
                const capacity = tentInfo ? tentInfo.capacity : 0;
                
                // Om det finns plats kvar i tältet och vi har personer kvar att placera
                if (peopleToPlace.length > 0 && tent.occupants.length < capacity) {
                    
                    // Kolla om tältet är tomt ELLER om det redan tillhör denna grupp
                    let isThisGroupTent = true;
                    if (tent.occupants.length > 0) {
                        const firstOccupantGroup = getGroup(tent.occupants[0]);
                        isThisGroupTent = (firstOccupantGroup === group);
                    }
                    
                    // Fyll på tältet!
                    if (isThisGroupTent) {
                        while (peopleToPlace.length > 0 && tent.occupants.length < capacity) {
                            tent.occupants.push(peopleToPlace.shift());
                        }
                    }
                }
            });
        });

        // Spara den nya fördelningen till databasen
        const dbPath = path.join(__dirname, 'data.json');
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
        
        res.json({ success: true, message: "Auto-fördelning klar!" });
    } catch (error) {
        console.error("[ERROR] Auto-assign misslyckades:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/clear-assignments', (req, res) => {
    try {
        const db = getDb();
        
        // Töm 'occupants'-arrayen för varje uppslaget tält
        db.assignments.forEach(tent => {
            tent.occupants = [];
        });
        
        const dbPath = path.join(__dirname, 'data.json');
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
        
        res.json({ success: true, message: "Alla placeringar är nollställda!" });
    } catch (error) {
        console.error("[ERROR] Kunde inte nollställa placeringar:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/tents', (req, res) => {
    try {
        const db = getDb();
        const { tentNumber } = req.body;

        if (tentNumber === undefined) return res.status(400).json({ error: "Tältnummer saknas" });

        // Ta bort tältet från listan. 
        // Eftersom personerna inte tas bort från deltagarlistan blir de automatiskt "oplacerade" i frontenden.
        db.assignments = db.assignments.filter(a => a.tentNumber !== parseInt(tentNumber));

        // Spara ändringarna
        const dbPath = path.join(__dirname, 'data.json');
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/inventory', (req, res) => {
    try {
        const db = getDb();
        db.inventory = req.body; // req.body är den nya arrayen med tälttyper
        
        const dbPath = path.join(__dirname, 'data.json');
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

function getDb() {
    const data = fs.readFileSync('./data.json', 'utf8');
    return JSON.parse(data);
}

app.get('/api/status', (req, res) => {
    const db = getDb();
    
    // Räkna personer
    const numLeaders = db.participants.leaders.length;
    const numScouts = 
        db.participants.scouts.sparare.length + 
        db.participants.scouts.upptackare.length + 
        db.participants.scouts.aventyrare.length;
    const totalPeople = numLeaders + numScouts;

    // Räkna tältkapacitet
    let totalCapacity = 0;
    db.inventory.forEach(tent => {
        totalCapacity += (tent.capacity * tent.quantityOwned);
    });

    const isEnough = totalCapacity >= totalPeople;
    const missingSpots = isEnough ? 0 : totalPeople - totalCapacity;

    res.json({
        totalPeople,
        totalCapacity,
        isEnough,
        missingSpots,
        message: isEnough 
            ? "Tälten räcker till alla!" 
            : `Varning! Ni saknar sovplatser för ${missingSpots} personer.`
    });
});

app.get('/api/report', (req, res) => {
    try {
        const db = getDb();
        const outputDir = path.join(__dirname, 'tmp');
        const outputPath = path.join(outputDir, 'tentplan_rapport.pdf');
        
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        generatePDF(db, outputPath, () => {
            res.download(outputPath);
        });
        
    } catch (error) {
        console.error("[ERROR] Kunde inte generera PDF-rapporten:", error);
        res.status(500).json({ success: false, error: "Kunde inte skapa rapporten." });
    }
});

const PORT = 3014;
app.listen(PORT, () => {
    console.log(`Scout-tält-systemet körs på port ${PORT}`);
});