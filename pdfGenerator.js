const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

function generatePDF(db, version, outputPath, callback) {
    // Sätter en generös bottenmarginal (120) så att den högre sidfoten får plats
    const doc = new PDFDocument({ 
        bufferPages: true, 
        margins: { top: 50, bottom: 120, left: 50, right: 50 } 
    });
    
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const logoPath = path.join(__dirname, 'public', 'style', 'img', 'logo-nodejs-transp-271x72.png');

    function getGroupName(name) {
        if (db.participants.leaders.includes(name)) return 'Ledare';
        if (db.participants.scouts.sparare.includes(name)) return 'Spårare';
        if (db.participants.scouts.upptackare.includes(name)) return 'Upptäckare';
        if (db.participants.scouts.aventyrare.includes(name)) return 'Äventyrare';
        if (db.participants.scouts.ledarbarn.includes(name)) return 'Ledarbarn';
        return 'Okänd';
    }

    // --- HUVUDRUBRIK ---
    doc.fontSize(22).text('Tältplanering: Scoutläger', { align: 'center' });
    doc.moveDown(1.5);

    // --- 1. SAMMANFATTNING & PLOCKLISTA ---
    doc.fontSize(16).text('Plocklista - Tält att ta med');
    doc.fontSize(12).moveDown(0.5);
    
    const packedTents = {};
    db.assignments.forEach(a => {
        if (!packedTents[a.tentType]) packedTents[a.tentType] = 0;
        packedTents[a.tentType]++;
    });

    db.inventory.forEach(tent => {
        const needed = packedTents[tent.id] || 0;
        const isEgetBoende = tent.name.toLowerCase() === 'eget boende';
        
        if (isEgetBoende || needed === 0) return; 

        doc.text(`- ${tent.name}: ${needed} st`);
        
        if (needed > tent.quantityOwned) {
            doc.fillColor('red')
               .text(`  VARNING: Ni har planerat in fler ${tent.name} än ni äger, det saknas: ${needed - tent.quantityOwned} st!`)
               .fillColor('black');
        }
    });
    doc.moveDown(2);

    // --- 2. TÄLTINDELNING MED ÅLDERSGRUPPER ---
    doc.fontSize(16).text('Tältindelning - Vem sover var?');
    doc.moveDown(0.5);

    db.assignments.forEach(assignment => {
        const tentInfo = db.inventory.find(t => t.id === assignment.tentType);
        const tentName = tentInfo ? tentInfo.name : 'Okänt tält';
        const isEgetBoende = tentName.toLowerCase() === 'eget boende';

        let titleString = '';
        if (isEgetBoende) {
            titleString = `${tentName}`;
        } else if (assignment.customName) {
            titleString = `${assignment.customName} (${tentName})`;
        } else {
            titleString = `Tält ${assignment.tentNumber} (${tentName})`;
        }
        
        doc.fontSize(14).text(titleString, { underline: true });
        doc.fontSize(12).moveDown(0.2);
        
        assignment.occupants.forEach(person => {
            const group = getGroupName(person);
            doc.text(`  • ${person} (${group})`);
        });
        
        if (tentInfo && !isEgetBoende && assignment.occupants.length > tentInfo.capacity) {
            doc.fillColor('red')
               .text(`  VARNING: Trångt! Tältet tar bara ${tentInfo.capacity} personer.`)
               .fillColor('black');
        }
        doc.moveDown();
    });

    // --- 3. ÖVERSIKTSKARTA (UPPDATERAD V2.0 FORMER & ROTATIONER) ---
    if (db.mapConfig && db.mapConfig.hasMap && db.mapConfig.imagePath) {
        doc.addPage();
        
        doc.fontSize(16).fillColor('black').text('3. Layoutskiss - Lägerområde');
        doc.fontSize(11).moveDown(0.5);
        doc.text('Gula/Röda zoner visar MSB säkerhetsavstånd. Röd zon indikerar att tält står för nära varandra.');
        doc.moveDown(1);

        // Bestäm bredd på kartan i PDF:en (A4 bredd minus marginaler = 495 punkter)
        const pdfMapWidth = 495;
        let pdfMapHeight = 371; // Standard-fallback (4:3)
        
        const mapStartX = doc.x;
        const mapStartY = doc.y;

        const absoluteImagePath = path.join(__dirname, 'public', db.mapConfig.imagePath);
        
        // Rita bakgrundskartan och räkna ut dynamisk höjd baserat på bildens proportioner
        if (fs.existsSync(absoluteImagePath)) {
            try {
                const img = doc.openImage(absoluteImagePath);
                const aspectRatio = img.height / img.width;
                pdfMapHeight = pdfMapWidth * aspectRatio; // Perfekt proportioner!
                doc.image(img, mapStartX, mapStartY, { width: pdfMapWidth, height: pdfMapHeight });
            } catch (e) {
                // Om något skiter sig med bildanalysen, kör standard-skalning
                doc.image(absoluteImagePath, mapStartX, mapStartY, { width: pdfMapWidth, height: pdfMapHeight });
            }
        }

        // Rita en snygg ram runt kartan
        doc.rect(mapStartX, mapStartY, pdfMapWidth, pdfMapHeight)
           .strokeColor('#cfd8dc')
           .lineWidth(2)
           .stroke();

        const mapMetersWidth = parseFloat(db.mapConfig.scaleLineMeters) || 100;
        const pixelsPerMeter = pdfMapWidth / mapMetersWidth;
        const safetyMargin = parseFloat(db.mapConfig.safetyMarginMeters) || 4;

        const placedTents = db.assignments.filter(t => t.isPlaced);

        placedTents.forEach((tent, i) => {
            const inv = db.inventory.find(item => item.id === tent.tentType);
            
            const shape = inv ? (inv.shape || 'circle') : 'circle';
            let widthM = inv ? (inv.width || 4.0) : 4.0;
            let lengthM = inv ? (inv.length || 4.0) : 4.0;
            
            // Hantera rotation i PDF:en
            if (tent.isRotated) {
                const temp = widthM;
                widthM = lengthM;
                lengthM = temp;
            }
            
            const wPx = widthM * pixelsPerMeter;
            const lPx = lengthM * pixelsPerMeter;
            
            const haloWPx = (widthM + safetyMargin) * pixelsPerMeter;
            const haloLPx = (lengthM + safetyMargin) * pixelsPerMeter;

            // Omvandla procentkoordinater till PDF-punkter på ängen
            const pxX = mapStartX + ((tent.x / 100) * pdfMapWidth);
            const pxY = mapStartY + ((tent.y / 100) * pdfMapHeight);

            // Avancerad Kollisionslogik (AABB-boxar) för PDF:en så färgerna matchar skärmen exakt
            let isColliding = false;
            for (let j = 0; j < placedTents.length; j++) {
                if (i === j) continue;
                const other = placedTents[j];
                const otherInv = db.inventory.find(item => item.id === other.tentType);
                
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
                
                const oPx = mapStartX + ((other.x / 100) * pdfMapWidth);
                const oPy = mapStartY + ((other.y / 100) * pdfMapHeight);

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

            // 1. RITA SÄKERHETSZONEN (Glorian)
            doc.save(); // Sparar grafik-tillstånd för opacitet
            doc.opacity(0.4);
            
            if (shape === 'rectangle') {
                doc.rect(pxX - haloWPx/2, pxY - haloLPx/2, haloWPx, haloLPx);
            } else {
                doc.circle(pxX, pxY, haloWPx/2);
            }
            
            doc.fillColor(isColliding ? '#e57373' : '#fff176') // Softare röd/gul för PDF-print
               .strokeColor(isColliding ? '#d32f2f' : '#fbc02d')
               .lineWidth(1)
               .fillAndStroke();
            doc.restore(); // Återställer opaciteten till 1.0 direkt

            // 2. RITA SJÄLVA TÄLTET
            if (shape === 'rectangle') {
                doc.rect(pxX - wPx/2, pxY - lPx/2, wPx, lPx);
            } else {
                doc.circle(pxX, pxY, wPx/2);
            }
            
            doc.fillColor('#388e3c')
               .strokeColor('#ffffff')
               .lineWidth(1.5)
               .fillAndStroke();

            // 3. RITA TÄLTNUMRET mitt i tältet
            doc.fillColor('#ffffff')
               .fontSize(10)
               .text(tent.tentNumber.toString(), pxX - 10, pxY - 5, { width: 20, align: 'center' });
        });

        // Återställ textinställningar efter kartritandet
        doc.fillColor('black').fontSize(12);
    }

    // --- INTERAKTIV SIDFOT ---
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        
        const oldBottomMargin = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        
        const footerStartY = doc.page.height - 105;

        // Linje ovanför sidfoten
        doc.moveTo(50, footerStartY)
           .lineTo(doc.page.width - 50, footerStartY)
           .strokeColor('#cfd8dc')
           .lineWidth(1)
           .stroke();

        // Rad 1: Kårens text
        doc.fontSize(9)
           .fillColor('#546e7a')
           .text('TentPlan - Det smarta tältplaneringsverktyget | Alltid redo!', 50, footerStartY + 15, { 
               align: 'center', 
               width: doc.page.width - 100 
           });
           
        // Rad 2: Partner-text
        doc.text('Utvecklat av och i samarbete med KS Webb (www.kswebb.se)', 50, footerStartY + 27, { 
               align: 'center', 
               width: doc.page.width - 100 
           });

        // Centrerad logga under texten
        if (fs.existsSync(logoPath)) {
            const logoWidth = 75;
            const logoX = (doc.page.width - logoWidth) / 2;
            doc.image(logoPath, logoX, footerStartY + 45, { width: logoWidth });
        }

        // Rad 4: Versionsnummer
        doc.text(`Systemversion ${version}`, 50, footerStartY + 75, { 
            align: 'center', 
            width: doc.page.width - 100 
        });

        doc.text(`Copyright © 2026 Kasper Sjöström. All rights reserved.`, 50, footerStartY + 87, { 
            align: 'center', 
            width: doc.page.width - 100 
        });

        // Sidnummer
        doc.text(`Sida ${i + 1} av ${range.count}`, doc.page.width - 150, doc.page.height - 40, { 
            width: 100, 
            align: 'right', 
            lineBreak: false 
        });

        doc.page.margins.bottom = oldBottomMargin;
    }

    doc.end();
    stream.on('finish', callback);
}

module.exports = generatePDF;