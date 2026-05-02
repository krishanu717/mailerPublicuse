'use client';

import { useState, useRef } from 'react';
import { UploadCloud, Send, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, LogIn, LogOut } from 'lucide-react';
import { useSession, signIn, signOut } from "next-auth/react";
import * as XLSX from 'xlsx';
import styles from './page.module.css';

export default function Home() {
  const { data: session, status: sessionStatus } = useSession();
  
  const [data, setData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [template, setTemplate] = useState('Hi {{Name}},\n\nWelcome to {{Company}}!');
  const [subject, setSubject] = useState('Welcome to {{Company}}');
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState(null); 
  const fileInputRef = useRef(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setStatus(null);

    try {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const bstr = evt.target.result;
          const workbook = XLSX.read(bstr, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

          if (jsonData && jsonData.length > 0) {
            setData(jsonData);
            setColumns(Object.keys(jsonData[0]));
            setSelectedRows(new Set(jsonData.map((_, i) => i)));
            setStatus({ type: 'success', message: `Successfully loaded ${jsonData.length} rows.` });
          } else {
            throw new Error('File is empty or invalid format');
          }
        } catch (err) {
          setStatus({ type: 'error', message: 'Error parsing file: ' + err.message });
        } finally {
          setIsUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      reader.onerror = () => {
        setStatus({ type: 'error', message: 'Failed to read file' });
        setIsUploading(false);
      };
      reader.readAsBinaryString(file);
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
      setIsUploading(false);
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

    if (selectedRows.size > 50) {
      setStatus({ type: 'error', message: 'Safety Limit Exceeded: Max 50 emails per request. Please select fewer rows.' });
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

  if (sessionStatus === "loading") {
    return (
      <div className={styles.container} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Loader2 className="spinner" size={40} />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div>
            <h1>Mailer</h1>
            <p>Send personalized emails directly from your Gmail account.</p>
          </div>
          <div>
            {session ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  {session.user?.email}
                </span>
                <button onClick={() => signOut()} className={`${styles.button} ${styles.buttonSecondary}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <LogOut size={16} /> Logout
                </button>
              </div>
            ) : (
              <button onClick={() => signIn('google')} className={styles.button} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <LogIn size={16} /> Sign in with Google
              </button>
            )}
          </div>
        </div>
      </header>

      {!session ? (
        <section className={styles.card} style={{ textAlign: 'center', padding: '50px 20px' }}>
          <h2>Welcome to Mailer</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '30px' }}>
            Please sign in with your Google account to authorize sending emails.
          </p>
          <button onClick={() => signIn('google')} className={styles.button} style={{ margin: '0 auto', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <LogIn size={20} /> Sign in with Google
          </button>
        </section>
      ) : (
        <>
          <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '15px', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <AlertCircle size={20} style={{ color: 'var(--text-secondary)', flexShrink: 0, marginTop: '2px' }} />
            <p style={{ fontSize: '0.9rem', margin: 0, color: 'var(--text-secondary)' }}>
              <strong>Safety Warning:</strong> Emails are sent using your Gmail account. Daily limits apply (~500/day). Please limit batches to 50 emails per request.
            </p>
          </div>

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
              <div style={{ marginTop: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Selected {selectedRows.size} of {data.length} rows. {data.length > 100 ? 'Showing first 100 rows.' : ''}
                </p>
                <button className={`${styles.button} ${styles.buttonSecondary}`} onClick={toggleAll} style={{ padding: '6px 12px', fontSize: '0.85rem' }}>
                  {selectedRows.size === data.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
            </section>
          )}

          {/* Template & Preview Section */}
          {data.length > 0 && (
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
                    style={{ width: '100%', display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: '5px' }}
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
          )}
        </>
      )}

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
