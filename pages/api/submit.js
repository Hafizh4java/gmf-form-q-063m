// IMPORT & SETUP (pakai CommonJS)
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { PDFDocument } = require("pdf-lib");
const formidable = require("formidable");
const dotenv = require("dotenv");
const brevo = require("@getbrevo/brevo");

// Load environment variables
dotenv.config();

// Set API Key Brevo
if (process.env.BREVO_API_KEY) {
  brevo.setApiKey(process.env.BREVO_API_KEY);
} else {
  console.warn("⚠️ BREVO_API_KEY tidak ditemukan di environment!");
}

// LOG ENVIRONMENT
console.log("ENV SMTP HOST:", process.env.SMTP_HOST);

// HANDLER API UTAMA
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const form = formidable({ multiples: true, keepExtensions: true });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("❌ Form parse error:", err);
      return res.status(400).json({ error: "Form parse error" });
    }

    try {
      console.log("✅ Form parsed successfully:", fields);

      // Ambil semua field dari form
      const requestChoice = fields.requestChoice?.[0] || "";
      const name = fields.name?.[0] || "";
      const id = fields.id?.[0] || "";
      const unit = fields.unit?.[0] || "";
      const jobTitle = fields.jobTitle?.[0] || "";
      const additionalInfo = fields.additionalInfo?.[0] || "";
      const email = fields.email?.[0] || "";

      const divisionHeadName = fields.divisionHeadName?.[0] || "";
      const divisionHeadDate = fields.divisionHeadDate?.[0] || "";
      const userName = fields.userName?.[0] || "";
      const userDate = fields.userDate?.[0] || "";
      const qaName = fields.qaName?.[0] || "";
      const qaDate = fields.qaDate?.[0] || "";

      if (!email) {
        return res.status(400).json({ error: "Email required" });
      }

      // Ambil file tanda tangan
      const divisionHeadSign = Array.isArray(files.divisionHeadSign)
        ? files.divisionHeadSign[0]
        : files.divisionHeadSign;
      const userSign = Array.isArray(files.userSign)
        ? files.userSign[0]
        : files.userSign;
      const qaSign = Array.isArray(files.qaSign)
        ? files.qaSign[0]
        : files.qaSign;

      // Buka template PDF
      const templatePath =
        process.env.PDF_TEMPLATE ||
        path.join(process.cwd(), "template", "Form-GMF-Q-063M-template.pdf");

      if (!fs.existsSync(templatePath)) {
        console.error("❌ Template PDF not found at", templatePath);
        return res.status(500).json({ error: "Template PDF not found" });
      }

      const existingPdfBytes = fs.readFileSync(templatePath);
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      const formPdf = pdfDoc.getForm();

      // Isi field di PDF
      formPdf.getTextField("name").setText(name);
      formPdf.getTextField("id").setText(id);
      formPdf.getTextField("unit").setText(unit);
      formPdf.getTextField("jobTitle").setText(jobTitle);
      formPdf.getTextField("additionalInfo").setText(additionalInfo || "-");
      formPdf.getTextField("divisionHeadName")?.setText(divisionHeadName);
      formPdf.getTextField("divisionHeadDate")?.setText(divisionHeadDate);
      formPdf.getTextField("userName")?.setText(userName);
      formPdf.getTextField("userDate")?.setText(userDate);
      formPdf.getTextField("qaName")?.setText(qaName);
      formPdf.getTextField("qaDate")?.setText(qaDate);

      // Tambah gambar tanda tangan
      async function embedImage(pdfDoc, filePath) {
        const imgBytes = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        if (ext === ".png") {
          return await pdfDoc.embedPng(imgBytes);
        } else if (ext === ".jpg" || ext === ".jpeg") {
          return await pdfDoc.embedJpg(imgBytes);
        } else {
          throw new Error("File tanda tangan harus PNG atau JPG");
        }
      }

      const signFields = [
        { field: "divisionHeadSign", file: divisionHeadSign },
        { field: "userSign", file: userSign },
        { field: "qaSign", file: qaSign },
      ];

      for (const { field, file } of signFields) {
        if (file?.filepath) {
          try {
            const sigImg = await embedImage(pdfDoc, file.filepath);
            const pdfField = formPdf.getButton(field);
            pdfField.setImage(sigImg);
          } catch (e) {
            console.warn(`⚠️ Error pada tanda tangan ${field}:`, e.message);
          }
        }
      }

      // Checkbox mapping
      const checkboxMapping = {
        "initial-stamp": "CheckBox1",
        "initial-coc": "CheckBox2",
        "renewal-coc": "CheckBox3",
        "change-rating": "CheckBox4",
      };

      const checkboxFieldName = checkboxMapping[requestChoice];
      if (checkboxFieldName) {
        try {
          const group = formPdf.getRadioGroup("Request");
          group.select(checkboxFieldName);
        } catch {
          try {
            formPdf.getCheckBox(checkboxFieldName).check();
          } catch {
            console.warn("⚠️ Checkbox tidak ditemukan:", checkboxFieldName);
          }
        }
      }

      // Simpan hasil PDF
      formPdf.flatten();
      const pdfBytes = await pdfDoc.save();
      const outName = `GMF-Form-Q-063M-${name.replace(
        /\s+/g,
        "_"
      )}-${Date.now()}.pdf`;
      const outPath = path.join(os.tmpdir(), outName);
      fs.writeFileSync(outPath, pdfBytes);

      // Kirim email
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      const attachments = [{ filename: outName, path: outPath }];
      ["license", "cv", "authLetter"].forEach((k) => {
        const f = files[k];
        const fileObj = Array.isArray(f) ? f[0] : f;
        if (fileObj?.filepath) {
          attachments.push({
            filename:
              fileObj.originalFilename || path.basename(fileObj.filepath),
            path: fileObj.filepath,
          });
        }
      });

      await transporter.sendMail({
        from: `"GMF AeroAsia" <${process.env.SMTP_USER}>`,
        to: email,
        subject: `Your GMF Q-063M Submission - ${name}`,
        text: `Dear ${name},\n\nThank you for submitting your form.\n\nRegards,\nGMF AeroAsia`,
        attachments,
      });

      console.log(`✅ Email sent successfully to ${email}`);
      return res.json({
        ok: true,
        message: "Form processed and email sent",
        pdf: outName,
      });
    } catch (err) {
      console.error("❌ Processing error:", err);
      return res.status(500).json({ error: String(err) });
    }
  });
};
