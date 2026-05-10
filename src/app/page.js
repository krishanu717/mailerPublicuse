'use client';

import { useState, useRef, useEffect } from 'react';
import { UploadCloud, Send, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, LogIn, LogOut, Link2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { useSession, signIn, signOut } from "next-auth/react";
import * as XLSX from 'xlsx';
import styles from './page.module.css';
import { detectColumns } from '../utils/columnDetection';

export default function Home() {
  const { data: session, status: sessionStatus } = useSession();
  
  const [data, setData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [selectedRows, setSelectedRows] = useState(new Set());
  
  // Mapping State
  const [mappings, setMappings] = useState({ email: '', name: '', company: '', role: '' });
  const [confidence, setConfidence] = useState({ email: 0, name: 0, company: 0, role: 0 });
  const [invalidEmailsCount, setInvalidEmailsCount] = useState(0);

  const [template, setTemplate] = useState('');
  const [subject, setSubject] = useState('');
  
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState(null); 
  const fileInputRef = useRef(null);

  // Email Validation Regex
  const isValidEmail = (email) => {
    return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).toLowerCase());
  };

  // Re-run validation whenever mappings.email or data changes
  useEffect(() => {
    if (data.length > 0 && mappings.email) {
      let invalidCount = 0;
      const validSelection = new Set();
      
      data.forEach((row, idx) => {
        const emailVal = row[mappings.email];
        if (isValidEmail(emailVal)) {
          validSelection.add(idx);
        } else {
          invalidCount++;
        }
      });
      
      setInvalidEmailsCount(invalidCount);
      setSelectedRows(validSelection);
    } else if (data.length > 0 && !mappings.email) {
      setInvalidEmailsCount(0);
      setSelectedRows(new Set());
    }
  }, [mappings.email, data]);

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
            const headers = Object.keys(jsonData[0]);
            setColumns(headers);
            
            // Smart Detection
            const detection = detectColumns(headers);
            setMappings(detection.mappings);
            setConfidence(detection.confidence);

            // Dynamic default template
            const defaultName = detection.mappings.name ? `{{${detection.mappings.name}}}` : 'there';
            const defaultCompany = detection.mappings.company ? `{{${detection.mappings.company}}}` : 'our company';
            
            setSubject(`Welcome to ${defaultCompany}`);
            setTemplate(`Hi ${defaultName},\n\nWelcome to ${defaultCompany}! We are thrilled to have you.`);
            
            setStatus({ type: 'success', message: `Successfully loaded ${jsonData.length} rows. Columns auto-detected.` });
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

  const handleMappingChange = (field, value) => {
    setMappings(prev => ({ ...prev, [field]: value }));
    setConfidence(prev => ({ ...prev, [field]: 100 })); // Set high confidence for manual override
  };

  const toggleRowSelection = (index) => {
    const newSelection = new Set(selectedRows);
    if (newSelection.has(index)) {
      newSelection.delete(index);
    } else {
      if (!mappings.email || isValidEmail(data[index][mappings.email])) {
        newSelection.add(index);
      }
    }
    setSelectedRows(newSelection);
  };

  const toggleAll = () => {
    const validRows = data.filter(row => mappings.email && isValidEmail(row[mappings.email]));
    if (selectedRows.size === validRows.length && validRows.length > 0) {
      setSelectedRows(new Set());
    } else {
      const newSelection = new Set();
      data.forEach((row, idx) => {
        if (mappings.email && isValidEmail(row[mappings.email])) {
          newSelection.add(idx);
        }
      });
      setSelectedRows(newSelection);
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
    if (!mappings.email) {
      setStatus({ type: 'error', message: 'Please map an Email column before sending.' });
      return;
    }

    if (selectedRows.size === 0) {
      setStatus({ type: 'error', message: 'Please select at least one valid recipient.' });
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
          recipients,
          emailColumn: mappings.email
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

          {/* Mapping Section */}
          {data.length > 0 && columns.length > 0 && (
            <section className={styles.card}>
              <div className={styles.cardTitle}>
                <Link2 size={24} />
                Smart Column Mapping
              </div>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '15px' }}>
                We've automatically detected these columns. You can manually adjust them if needed.
              </p>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '15px' }}>
                {['email', 'name', 'company', 'role'].map(field => (
                  <div key={field} style={{ backgroundColor: 'var(--bg-color)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ textTransform: 'capitalize', fontWeight: 'bold', fontSize: '0.9rem' }}>{field}</span>
                      {mappings[field] && confidence[field] >= 60 && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', backgroundColor: 'rgba(19, 115, 51, 0.1)', color: '#137333', padding: '2px 6px', borderRadius: '12px' }}>
                          <CheckCircle size={12} /> {confidence[field] >= 80 ? 'High' : 'Good'} Match
                        </span>
                      )}
                    </div>
                    <select 
                      value={mappings[field]} 
                      onChange={(e) => handleMappingChange(field, e.target.value)}
                      className={styles.input}
                      style={{ padding: '8px', width: '100%', fontSize: '0.9rem' }}
                    >
                      <option value="">-- Select Column --</option>
                      {columns.map(col => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {!mappings.email && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: '#d93025', backgroundColor: '#fce8e6', padding: '10px', borderRadius: '6px', fontSize: '0.85rem' }}>
                  <ShieldAlert size={16} /> Please map an Email column to continue.
                </div>
              )}
              {invalidEmailsCount > 0 && mappings.email && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: '#b06000', backgroundColor: '#fef7e0', padding: '10px', borderRadius: '6px', fontSize: '0.85rem', marginTop: '10px' }}>
                  <AlertTriangle size={16} /> {invalidEmailsCount} invalid email(s) detected and automatically skipped.
                </div>
              )}
            </section>
          )}

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
                          checked={selectedRows.size > 0 && selectedRows.size === data.filter(row => isValidEmail(row[mappings.email])).length}
                          onChange={toggleAll}
                          disabled={!mappings.email}
                        />
                      </th>
                      {columns.map((col, idx) => (
                        <th key={idx}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.slice(0, 100).map((row, idx) => {
                      const isEmailValid = mappings.email ? isValidEmail(row[mappings.email]) : false;
                      return (
                        <tr key={idx} style={{ opacity: isEmailValid ? 1 : 0.5 }}>
                          <td>
                            <input 
                              type="checkbox" 
                              className={styles.checkbox}
                              checked={selectedRows.has(idx)}
                              onChange={() => toggleRowSelection(idx)}
                              disabled={!isEmailValid}
                            />
                          </td>
                          {columns.map((col, colIdx) => (
                            <td key={colIdx} style={{ color: col === mappings.email && !isEmailValid ? '#d93025' : 'inherit' }}>
                              {row[col]}
                              {col === mappings.email && !isEmailValid && (
                                <AlertTriangle size={12} style={{ display: 'inline', marginLeft: 4, color: '#d93025' }} title="Invalid email format" />
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Selected {selectedRows.size} of {data.length} rows. {data.length > 100 ? 'Showing first 100 rows.' : ''}
                </p>
                <button className={`${styles.button} ${styles.buttonSecondary}`} onClick={toggleAll} style={{ padding: '6px 12px', fontSize: '0.85rem' }} disabled={!mappings.email}>
                  {selectedRows.size > 0 ? 'Deselect All' : 'Select All Valid'}
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

                <div style={{ marginTop: '15px' }}>
                  <label style={{ fontSize: '0.9rem', fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>Available Variables:</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {columns.map(c => (
                      <span 
                        key={c} 
                        style={{ 
                          fontSize: '0.8rem', 
                          backgroundColor: 'var(--bg-color)', 
                          padding: '4px 8px', 
                          borderRadius: '4px', 
                          border: '1px solid var(--border-color)',
                          cursor: 'pointer'
                        }}
                        onClick={() => setTemplate(prev => prev + `{{${c}}}`)}
                        title="Click to insert into body"
                      >
                        {`{{${c}}}`}
                      </span>
                    ))}
                  </div>
                  <p style={{fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '8px'}}>Click a variable to insert it into the email body.</p>
                </div>
              </section>

              {/* Preview */}
              <section className={styles.card}>
                <h2 className={styles.cardTitle}>Live Preview</h2>
                <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '15px'}}>
                  Previewing valid row {selectedRows.size > 0 ? Array.from(selectedRows)[0] + 1 : 1}
                </p>
                
                <div className={styles.previewBox}>
                  <div className={styles.previewSubject}>
                    Subject: {replacePlaceholders(subject, previewData) || 'No subject'}
                  </div>
                  <div className={styles.previewBody} style={{ whiteSpace: 'pre-wrap' }}>
                    {replacePlaceholders(template, previewData) || 'No content'}
                  </div>
                </div>

                <div style={{marginTop: '20px'}}>
                  <button 
                    className={styles.button} 
                    onClick={handleSend}
                    disabled={isSending || selectedRows.size === 0 || !mappings.email}
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
