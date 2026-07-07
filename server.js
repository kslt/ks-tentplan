// Copyright (c) 2026 Kasper Sjöström. All rights reserved. License: AGPL-3.0 license. www.kswebb.se - Thanks to Gemini for helping me out with this project.
const express = require('express');
const VERSION = '2.1.3';
const fs = require('fs');
const path = require('path');
const generatePDF = require('./pdfGenerator');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use(express.static('public'));

app.get('/api/data', (req, res) => {
    res.json(getDb());
});

app.post('/api/assignments', (req, res) => {
    const db = getDb();
    
    db.assignments = req.body; 

    const dbPath = path.join(__dirname, 'data.json');
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
    
    res.json({ success: true, message: "Tältindelning sparad!" });
});

app.post('/api/participants', (req, res) => {
    try {
        const db = getDb();
        const { name, group } = req.body;

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
        
        const nextNumber = db.assignments.length > 0 
            ? Math.max(...db.assignments.map(a => a.tentNumber)) + 1 
            : 1;

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
            tent.customName = customName;
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

        function getGroup(name) {
            if (db.participants.leaders.includes(name)) return 'leaders';
            if (db.participants.scouts.sparare.includes(name)) return 'sparare';
            if (db.participants.scouts.upptackare.includes(name)) return 'upptackare';
            if (db.participants.scouts.aventyrare.includes(name)) return 'aventyrare';
            if (db.participants.scouts.ledarbarn.includes(name)) return 'ledarbarn';
            return null;
        }

        // 1. Skapa en lista över alla som redan har en plats
        let placed = new Set();
        db.assignments.forEach(tent => tent.occupants.forEach(p => placed.add(p)));

        // 2. Samla alla som är OPLACERADE, uppdelat per grupp
        let unassigned = { leaders: [], sparare: [], upptackare: [], aventyrare: [], ledarbarn: [] };
        
        db.participants.leaders.forEach(p => { if (!placed.has(p)) unassigned.leaders.push(p); });
        ['sparare', 'upptackare', 'aventyrare', 'ledarbarn'].forEach(group => {
            if (db.participants.scouts[group]) {
                db.participants.scouts[group].forEach(p => { if (!placed.has(p)) unassigned[group].push(p); });
            }
        });

        const groupsToAssign = ['leaders', 'sparare', 'upptackare', 'aventyrare', 'ledarbarn'];

        // 3. Fördela grupperna en och en
        groupsToAssign.forEach(group => {
            let peopleToPlace = unassigned[group];
            
            db.assignments.forEach(tent => {
                const tentInfo = db.inventory.find(t => t.id === tent.tentType);
                const capacity = tentInfo ? tentInfo.capacity : 0;

                if (peopleToPlace.length > 0 && tent.occupants.length < capacity) {
                    
                    let isThisGroupTent = true;
                    if (tent.occupants.length > 0) {
                        const firstOccupantGroup = getGroup(tent.occupants[0]);
                        isThisGroupTent = (firstOccupantGroup === group);
                    }
                    
                    if (isThisGroupTent) {
                        while (peopleToPlace.length > 0 && tent.occupants.length < capacity) {
                            tent.occupants.push(peopleToPlace.shift());
                        }
                    }
                }
            });
        });

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

        db.assignments = db.assignments.filter(a => a.tentNumber !== parseInt(tentNumber));

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
        db.inventory = req.body;
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
    
    const numLeaders = db.participants.leaders.length;
    const numScouts = 
        db.participants.scouts.sparare.length + 
        db.participants.scouts.upptackare.length + 
        db.participants.scouts.aventyrare.length +
        db.participants.scouts.ledarbarn.length;
    const totalPeople = numLeaders + numScouts;

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
            : `Varning! Ni saknar sovplatser för ${missingSpots} personer.`,
        version: VERSION
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
        
        generatePDF(db, VERSION, outputPath, () => {
            res.download(outputPath);
        });
        
    } catch (error) {
        console.error("[ERROR] Kunde inte generera PDF-rapporten:", error);
        res.status(500).json({ success: false, error: "Kunde inte skapa rapporten." });
    }
});

// Kartfunktioner
app.get('/api/map/config', (req, res) => {
    try {
        const db = getDb();
        if (!db.mapConfig) {
            db.mapConfig = { hasMap: false, imagePath: null, scaleLineMeters: 10, scaleLinePixels: 100, safetyMarginMeters: 4 };
        }
        res.json(db.mapConfig);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/map/upload', (req, res) => {
    try {
        const db = getDb();
        const { imageBase64, safetyMarginMeters, scaleLineMeters } = req.body;

        if (!db.mapConfig) db.mapConfig = {};

        if (imageBase64) {
            // Skapa en 'uploads'-mapp inuti public om den inte finns
            const uploadDir = path.join(__dirname, 'public', 'uploads');
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }

            const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
            const filename = `layouthandling_${Date.now()}.png`;
            const filePath = path.join(uploadDir, filename);

            // Spara bilden på serverns hårddisk
            fs.writeFileSync(filePath, base64Data, 'base64');
            
            db.mapConfig.hasMap = true;
            db.mapConfig.imagePath = `/uploads/${filename}`;
        }

        // Uppdatera inställningarna
        if (safetyMarginMeters !== undefined) db.mapConfig.safetyMarginMeters = parseFloat(safetyMarginMeters);
        if (scaleLineMeters !== undefined) db.mapConfig.scaleLineMeters = parseFloat(scaleLineMeters);

        // Spara till data.json
        fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify(db, null, 2), 'utf8');
        res.json({ success: true, mapConfig: db.mapConfig });

    } catch (error) {
        console.error("[ERROR] Kunde inte ladda upp kartan:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/tents/position/:number', (req, res) => {
    try {
        const db = getDb();
        const tentNumber = parseInt(req.params.number);
        const { x, y, isPlaced, isRotated, scaleLinePixels } = req.body;

        const tent = db.assignments.find(t => t.tentNumber === tentNumber);
        if (tent) {
            tent.x = x !== null ? parseFloat(x) : null;
            tent.y = y !== null ? parseFloat(y) : null;
            tent.isPlaced = !!isPlaced;
            tent.isRotated = !!isRotated;

            if (scaleLinePixels !== undefined && db.mapConfig) {
                db.mapConfig.scaleLinePixels = parseInt(scaleLinePixels);
            }

            fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify(db, null, 2), 'utf8');
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, error: "Tältet hittades inte" });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/inventory/dimensions/:id', (req, res) => {
    try {
        const db = getDb();
        const tentId = req.params.id;
        const { shape, width, length } = req.body;

        const tent = db.inventory.find(t => t.id === tentId);
        if (tent) {
            tent.shape = shape || 'circle';
            tent.width = parseFloat(width) || 4.0;
            tent.length = parseFloat(length) || 4.0;

            fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify(db, null, 2), 'utf8');
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, error: "Tälttypen hittades inte i lagret" });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/save', (req, res) => {
    try {
        const dbPath = path.join(__dirname, 'data.json');
        fs.writeFileSync(dbPath, JSON.stringify(req.body, null, 2), 'utf8');
        res.json({ success: true });
    } catch (error) {
        console.error("[ERROR] Kunde inte spara efter drag-and-drop:", error);
        res.status(500).json({ success: false, error: "Kunde inte spara data." });
    }
});

const PORT = 3014;
app.listen(PORT, () => {
    console.log(`Scout-tält-systemet körs på port ${PORT}`);
});