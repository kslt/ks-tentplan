// Copyright (c) 2026 Kasper Sjöström. All rights reserved. www.kswebb.se
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

function generatePDF(db, outputPath, callback) {
    // Sätter en generös bottenmarginal (120) så att den högre sidfoten får plats 
    // utan att krocka med tältlistan. bufferPages gör att vi kan bygga sidfötterna sist.
    const doc = new PDFDocument({ 
        bufferPages: true, 
        margins: { top: 50, bottom: 120, left: 50, right: 50 } 
    });
    
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    // Sökväg till din logga (.png-format krävs för PDFKit)
    const logoPath = path.join(__dirname, 'public', 'style', 'img', 'logo-nodejs-transp-271x72.png');

    // Hjälpfunktion för att hämta gruppnamn till PDF:en
    function getGroupName(name) {
        if (db.participants.leaders.includes(name)) return 'Ledare';
        if (db.participants.scouts.sparare.includes(name)) return 'Spårare';
        if (db.participants.scouts.upptackare.includes(name)) return 'Upptäckare';
        if (db.participants.scouts.aventyrare.includes(name)) return 'Äventyrare';
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

        if (isEgetBoende) {
            return; 
        }

        doc.text(`- ${tent.name}: ${needed} st (Ni äger ${tent.quantityOwned} st)`);
        
        // Varna om ni har planerat in fler tält än ni äger
        if (needed > tent.quantityOwned) {
            doc.fillColor('red')
               .text(`  VARNING: Ni har planerat in fler ${tent.name} än ni äger! Saknas: ${needed - tent.quantityOwned} st`)
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

        // Anpassa rubriken i PDF:en utifrån customName eller Eget boende
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
        
        // Varna om det är trångt, men stäng av varningen helt om det är Eget boende
        if (tentInfo && !isEgetBoende && assignment.occupants.length > tentInfo.capacity) {
            doc.fillColor('red')
               .text(`  VARNING: Trångt! Tältet tar bara ${tentInfo.capacity} personer.`)
               .fillColor('black');
        }
        doc.moveDown();
    });

    // --- MAGISK OCH INTERAKTIV SIDFOT ---
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        
        // Stäng tillfälligt av bottenmarginalen under renderingen av sidfoten
        // för att förhindra att PDFKit av misstag skapar en extra tom sida.
        const oldBottomMargin = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        
        // Y-koordinat för var sidfotens linje ska dras (105px från botten)
        const footerStartY = doc.page.height - 105;

        doc.moveTo(50, footerStartY)
           .lineTo(doc.page.width - 50, footerStartY)
           .strokeColor('#cfd8dc')
           .lineWidth(1)
           .stroke();

        doc.fontSize(9)
           .fillColor('#546e7a')
           .text('Tältplaneringsverktyget TentPlan | Alltid redo!', 50, footerStartY + 15, { 
               align: 'center', 
               width: doc.page.width - 100 
           });

        doc.text('Utvecklat av och i samarbete med Kasper på KS Webb (www.kswebb.se)', 50, footerStartY + 27, { 
               align: 'center', 
               width: doc.page.width - 100 
           });

        if (fs.existsSync(logoPath)) {
            const logoWidth = 75;
            const logoX = (doc.page.width - logoWidth) / 2;
            doc.image(logoPath, logoX, footerStartY + 45, { width: logoWidth });
        }

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