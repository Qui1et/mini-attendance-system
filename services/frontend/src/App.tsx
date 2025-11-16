import React, { useState, useEffect } from 'react'
import axios from 'axios'

const handleLogin = async () => {
  try {
    await login('admin@company.com', 'password123');
    // redirect or update state
  } catch (err) {
    console.error(err);
  }
};
interface Report {
  employee_id: number
  date: string
  checkin_time: string | null
  checkout_time: string | null
  status: string
}

function App() {
  const [token, setToken] = useState('')
  const [employeeId] = useState(1)
  const [email, setEmail] = useState('admin@company.com')
  const [password, setPassword] = useState('password123')
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0])
  const [report, setReport] = useState<Report[]>([])

  const AUTH = 'http://localhost:4001'
  const ATTENDANCE_API = 'http://localhost:4002'
  const REPORT_API = 'http://localhost:4003'

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    } else {
      delete axios.defaults.headers.common['Authorization']
    }
  }, [token])

  const login = async () => {
    try {
      const res = await axios.post(`${AUTH}/auth/login`, { email, password })
      setToken(res.data.token)
    } catch (err: any) {
      alert(err.response?.data?.error || 'Login failed')
    }
  }

  const checkin = async () => {
    try {
      await axios.post(`${ATTENDANCE_API}/attendance/checkin`, { employeeId })
      alert('Check-in success!')
    } catch (err: any) {
      alert(err.response?.data?.error || 'Check-in failed')
    }
  }

  const checkout = async () => {
    try {
      await axios.post(`${ATTENDANCE_API}/attendance/checkout`, { employeeId })
      alert('Check-out success!')
    } catch (err: any) {
      alert(err.response?.data?.error || 'Check-out failed')
    }
    }

  const getReport = async () => {
    try {
      const res = await axios.get(`${REPORT_API}/report/daily`, { params: { date: reportDate } })
      setReport(res.data)
    } catch (err) {
      alert('Failed to load report')
    }
  }

  const exportCsv = async () => {
    try {
      const res = await axios.get(`${REPORT_API}/report/export`, {
        params: { date: reportDate },
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `report-${reportDate}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (err) {
      alert('Export failed')
    }
  }

  const logout = () => {
    setToken('')
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 20, fontFamily: 'Arial' }}>
      <h1>Mini Attendance System</h1>

      {!token ? (
        <div>
          <h2>Login</h2>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" />
          <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Password" />
          <button onClick={login}>Login</button>
        </div>
      ) : (
        <div>
          <h2>Welcome, Employee {employeeId}</h2>
          <button onClick={checkin}>Check In</button>
          <button onClick={checkout}>Check Out</button>
          <button onClick={logout}>Logout</button>

          <h3>Daily Report</h3>
          <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} />
          <button onClick={getReport}>Load Report</button>
          {report.length > 0 && <button onClick={exportCsv}>Export CSV</button>}

          {report.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 20 }}>
              <thead>
                <tr>
                  <th style={thStyle}>ID</th>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Check-in</th>
                  <th style={thStyle}>Check-out</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {report.map(r => (
                  <tr key={`${r.employee_id}-${r.date}`}>
                    <td style={tdStyle}>{r.employee_id}</td>
                    <td style={tdStyle}>{r.date}</td>
                    <td style={tdStyle}>{r.checkin_time || '-'}</td>
                    <td style={tdStyle}>{r.checkout_time || '-'}</td>
                    <td style={tdStyle}>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

const thStyle = { border: '1px solid #ccc', padding: 8, background: '#f0f0f0' }
const tdStyle = { border: '1px solid #ccc', padding: 8 }

export default App