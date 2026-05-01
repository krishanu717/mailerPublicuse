'use client';

import { useState, useRef, useEffect } from 'react';
import { UploadCloud, Send, FileSpreadsheet, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import styles from './page.module.css';

export default function Home() {
  const [data, setData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [template, setTemplate] = useState('Hi {{Name}},\n\nWelcome to {{Company}}!');
  const [subject, setSubject] = useState('Welcome to {{Company}}');
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'success' | 'error' | 'info', message: string }
  const fileInputRef = useRef(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setStatus(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/parse', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to parse file');
      }

      if (result.data && result.data.length > 0) {
        setData(result.data);
        setColumns(Object.keys(result.data[0]));
        // Select all by default
        setSelectedRows(new Set(result.data.map((_, i) => i)));
        setStatus({ type: 'success', message: `Successfully loaded ${result.data.length} rows.` });
      } else {
        throw new Error('File is empty or invalid format');
      }
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    } finally {
      setIsUploading(false);
      // Reset input so the same file can be uploaded again if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleRowSelection = (index) => {
    const newSelection = new Set(selectedRows);
    if (newSelection.has(index)) {
      newSelection.delete(index);
    } else {
      newSelection.add(index);
    }
    setSelectedRows(newSelection);
  };

  const toggleAll = () => {
    if (selectedRows.size === data.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(data.map((_, i) => i)));
    }
  };

  const replacePlaceholders = (text, rowData) => {
    if (!text || !rowData) return text;
    return text.replace(/\{\{(.*?)\}\}/g, (match, key) => {
      const trimmedKey = key.trim();
      return rowData[trimmedKey] !== undefined ? rowData[trimmedKey] : match;
    });
  };

  const previewData = data.length > 0 && selectedRows.size > 0 
    ? data[Array.from(selectedRows)[0]] 
    : data[0] || {};

  const handleSend = async () => {
    if (selectedRows.size === 0) {
      setStatus({ type: 'error', message: 'Please select at least one recipient.' });
      return;
    }

    setIsSending(true);
    setStatus({ type: 'info', message: 'Sending emails...' });

    const recipients = Array.from(selectedRows).map(index => data[index]);

    try {
      const response = await fetch('/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          template,
          subject,
          recipients
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send emails');
      }

      const successCount = result.results.filter(r => r.status === 'Success').length;
      const failCount = result.results.length - successCount;

      setStatus({ 
        type: successCount > 0 && failCount === 0 ? 'success' : 'info', 
        message: `Finished! Sent: ${successCount}, Failed: ${failCount}` 
      });
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Mailer</h1>
        <p>Upload data, write a template, and send personalized emails via Gmail.</p>
      </header>

      {/* Upload Section */}
      <section className={styles.card}>
        <div 
          className={styles.uploadArea} 
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadCloud className={styles.uploadIcon} />
          {isUploading ? (
            <p>Uploading and parsing...</p>
          ) : (
            <>
              <h3>Upload Excel or CSV File</h3>
              <p>Click to select or drag and drop</p>
            </>
          )}
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
            className={styles.fileInput} 
          />
        </div>
        
        {status && (
          <div className={`${styles.statusMessage} ${
            status.type === 'error' ? styles.statusError : 
            status.type === 'success' ? styles.statusSuccess : styles.statusInfo
          }`}>
            {status.type === 'error' && <AlertCircle size={16} style={{display: 'inline', marginRight: 8, verticalAlign: 'text-bottom'}}/>}
            {status.type === 'success' && <CheckCircle size={16} style={{display: 'inline', marginRight: 8, verticalAlign: 'text-bottom'}}/>}
            {status.message}
          </div>
        )}
      </section>

      {/* Data Table Section */}
      {data.length > 0 && (
        <section className={styles.card}>
          <div className={styles.cardTitle}>
            <FileSpreadsheet size={24} />
            Recipients Data
          </div>
          
          <div className={styles.tableWrapper}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>
                    <input 
                      type="checkbox" 
                      className={styles.checkbox}
                      checked={selectedRows.size === data.length && data.length > 0}
                      onChange={toggleAll}
                    />
                  </th>
                  {columns.map((col, idx) => (
                    <th key={idx}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.slice(0, 100).map((row, idx) => (
                  <tr key={idx}>
                    <td>
                      <input 
                        type="checkbox" 
                        className={styles.checkbox}
                        checked={selectedRows.has(idx)}
                        onChange={() => toggleRowSelection(idx)}
                      />
                    </td>
                    {columns.map((col, colIdx) => (
                      <td key={colIdx}>{row[col]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.length > 100 && (
            <p style={{marginTop: 15, fontSize: '0.85rem', color: 'var(--text-secondary)'}}>
              Showing first 100 rows. Total rows: {data.length}.
            </p>
          )}
        </section>
      )}

      {/* Template & Preview Section */}
      <div className={styles.grid}>
        {/* Editor */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Email Template</h2>
          
          <div className={styles.formGroup}>
            <label>Subject Line</label>
            <input 
              type="text" 
              className={styles.input}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Enter subject with {{Placeholders}}"
            />
          </div>

          <div className={styles.formGroup}>
            <label>Email Body</label>
            <textarea 
              className={styles.textarea}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="Write your email body here. Use {{ColumnName}} to insert data."
            />
          </div>

          <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)'}}>
            Available Placeholders: {columns.length > 0 ? columns.map(c => `{{${c}}}`).join(', ') : 'Upload data to see placeholders'}
          </p>
        </section>

        {/* Preview */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Live Preview</h2>
          <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '15px'}}>
            Previewing row {selectedRows.size > 0 ? Array.from(selectedRows)[0] + 1 : 1}
          </p>
          
          <div className={styles.previewBox}>
            <div className={styles.previewSubject}>
              Subject: {replacePlaceholders(subject, previewData) || 'No subject'}
            </div>
            <div className={styles.previewBody}>
              {replacePlaceholders(template, previewData) || 'No content'}
            </div>
          </div>

          <div style={{marginTop: '20px'}}>
            <button 
              className={styles.button} 
              onClick={handleSend}
              disabled={isSending || selectedRows.size === 0}
            >
              {isSending ? (
                <><Loader2 className="spinner" size={20} /> Sending...</>
              ) : (
                <><Send size={20} /> Send {selectedRows.size} Emails</>
              )}
            </button>
          </div>
        </section>
      </div>

      <style jsx global>{`
        .spinner {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
