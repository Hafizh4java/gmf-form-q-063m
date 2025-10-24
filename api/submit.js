// IMPORT & SETUP (pakai ES Module)
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import os from "os";
import { PDFDocument } from "pdf-lib";
import formidable from "formidable";
import Brevo from "@getbrevo/brevo";

// SETUP BREVO
const apiInstance = new Brevo.TransactionalEmailsApi();
apiInstance.authentications.apiKey.apiKey = process.env.BREVO_API_KEY;

console.log("✅ Brevo API Key loaded successfully");

// LOG ENVIRONMENT
console.log("ENV SMTP HOST:", process.env.SMTP_HOST);

// HANDLER UTAMA
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
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

      // AMBIL FIELD FORM
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

      if (!email) return res.status(400).json({ error: "Email required" });

      // TANDA TANGAN
      const getFile = (f) => (Array.isArray(f) ? f[0] : f);
      const divisionHeadSign = getFile(files.divisionHeadSign);
      const userSign = getFile(files.userSign);
      const qaSign = getFile(files.qaSign);

      // BUKA TEMPLATE PDF
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

      // ISI FIELD
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

      // TAMBAH GAMBAR TANDA TANGAN
      async function embedImage(pdfDoc, filePath) {
        const imgBytes = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        if (ext === ".png") return pdfDoc.embedPng(imgBytes);
        if (ext === ".jpg" || ext === ".jpeg") return pdfDoc.embedJpg(imgBytes);
        throw new Error("File tanda tangan harus PNG atau JPG");
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
            console.warn(`⚠️ Error tanda tangan ${field}:`, e.message);
          }
        }
      }

      // CHECKBOX MAPPING
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

      // SIMPAN PDF
      formPdf.flatten();
      const pdfBytes = await pdfDoc.save();
      const outName = `GMF-Form-Q-063M-${name.replace(
        /\s+/g,
        "_"
      )}-${Date.now()}.pdf`;
      const outPath = path.join(os.tmpdir(), outName);
      fs.writeFileSync(outPath, pdfBytes);

      // KIRIM EMAIL (SMTP)
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
        const f = getFile(files[k]);
        if (f?.filepath) {
          attachments.push({
            filename: f.originalFilename || path.basename(f.filepath),
            path: f.filepath,
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
      console.error("❌ Full Error Stack:", err.stack);
      return res.status(500).json({ error: String(err) });
    }
  });
}
