'use client'
import { useEffect, useState } from 'react'
import { profileApi } from '@/lib/api'
import { getErrorMessage } from '@/lib/utils'
import { Card, CardContent, Button, Input, Select, FormField, Alert, Spinner, EmptyState, Badge } from '@/components/ui/index'

const RELATIONSHIPS = [
  { value: '', label: 'Relationship…' },
  { value: 'FATHER', label: '👨 Father' },
  { value: 'MOTHER', label: '👩 Mother' },
  { value: 'SIBLING', label: '👫 Brother/Sister' },
  { value: 'SPOUSE', label: '💑 Spouse' },
  { value: 'RELATIVE', label: '👪 Relative' },
  { value: 'FRIEND', label: '🤝 Friend' },
  { value: 'OTHER', label: '👤 Other' },
]

const REL_ICONS: Record<string, string> = {
  FATHER: '👨', MOTHER: '👩', SIBLING: '👫', SPOUSE: '💑', RELATIVE: '👪', FRIEND: '🤝', OTHER: '👤',
}

const BLANK = { relationship: '', name: '', phone: '', email: '', priority: '1' }

export default function EmergencyContactsPage() {
  const [contacts, setContacts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState(BLANK)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = () => profileApi.getContacts()
    .then(r => setContacts(r.data.data.contacts))
    .finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }))

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.relationship) errs.relationship = 'Select a relationship'
    if (!form.name.trim() || form.name.trim().length < 2) errs.name = 'Enter the contact name'
    if (!form.phone) errs.phone = 'Phone number is required'
    else if (!/^\+?[1-9]\d{9,14}$/.test(form.phone.replace(/\s/g, ''))) errs.phone = 'Enter a valid phone number'
    if (form.email && !/\S+@\S+\.\S+/.test(form.email)) errs.email = 'Enter a valid email'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!validate()) return
    setSubmitting(true)
    try {
      const payload = { ...form, priority: parseInt(form.priority), email: form.email || undefined }
      if (editing) await profileApi.updateContact(editing, payload)
      else await profileApi.addContact(payload)
      setShowForm(false); setEditing(null); setForm(BLANK)
      setSuccess(editing ? 'Contact updated!' : 'Contact added!')
      setTimeout(() => setSuccess(''), 3000)
      load()
    } catch (err) { setError(getErrorMessage(err)) }
    finally { setSubmitting(false) }
  }

  const startEdit = (c: any) => {
    setEditing(c.id)
    setForm({ relationship: c.relationship, name: c.name, phone: c.phone, email: c.email || '', priority: String(c.priority) })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this emergency contact?')) return
    setDeletingId(id)
    try { await profileApi.deleteContact(id); load() }
    catch (err) { setError(getErrorMessage(err)) }
    finally { setDeletingId(null) }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner className="w-8 h-8 text-red-600" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Emergency Contacts</h1>
          <p className="text-muted-foreground text-sm mt-1">These people are alerted immediately when an accident is verified. Max 5 contacts.</p>
        </div>
        {contacts.length < 5 && (
          <Button variant="danger" onClick={() => { setShowForm(true); setEditing(null); setForm(BLANK) }}>
            + Add Contact
          </Button>
        )}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm text-blue-800 font-semibold mb-1">📱 How notifications work</p>
        <p className="text-sm text-blue-700">
          When an accident is detected, your contacts are notified instantly via SMS, WhatsApp, and Email (if provided).
          The message includes your location and a Google Maps link. Priority 1 is contacted first.
        </p>
      </div>

      {/* Form */}
      {showForm && (
        <Card className="border-red-100">
          <CardContent className="pt-5">
            <h2 className="font-bold text-base mb-4">{editing ? 'Edit Contact' : 'Add Emergency Contact'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Relationship" required>
                  <Select options={RELATIONSHIPS} value={form.relationship}
                    onChange={e => setForm(p => ({ ...p, relationship: e.target.value }))}
                    error={fieldErrors.relationship} />
                </FormField>
                <FormField label="Priority">
                  <Select
                    options={[1,2,3,4,5].map(n => ({ value: String(n), label: `Priority ${n}${n === 1 ? ' (First)' : ''}` }))}
                    value={form.priority}
                    onChange={e => setForm(p => ({ ...p, priority: e.target.value }))} />
                </FormField>
                <FormField label="Full Name" required>
                  <Input placeholder="Contact's full name" value={form.name} onChange={set('name')} error={fieldErrors.name} />
                </FormField>
                <FormField label="Mobile Number" required>
                  <Input type="tel" placeholder="+919876543210" value={form.phone} onChange={set('phone')} error={fieldErrors.phone} />
                </FormField>
                <FormField label="Email Address">
                  <Input type="email" placeholder="contact@example.com" value={form.email} onChange={set('email')} error={fieldErrors.email} />
                </FormField>
              </div>
              <div className="flex gap-3">
                <Button type="submit" variant="danger" loading={submitting} className="flex-1">
                  {editing ? 'Update' : 'Add Contact'}
                </Button>
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditing(null) }}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Contact list */}
      {contacts.length === 0 && !showForm ? (
        <Card>
          <EmptyState icon="📞" title="No emergency contacts" description="Add at least one contact who will be alerted if you're in an accident."
            action={<Button variant="danger" onClick={() => setShowForm(true)}>Add First Contact</Button>} />
        </Card>
      ) : (
        <div className="space-y-3">
          {contacts.sort((a, b) => a.priority - b.priority).map((c: any) => (
            <Card key={c.id}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0">
                    {REL_ICONS[c.relationship] || '👤'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-gray-900">{c.name}</p>
                      <Badge variant="muted" className="text-xs">{c.relationship}</Badge>
                      <Badge variant={c.priority === 1 ? 'danger' : 'muted'} className="text-xs">
                        Priority {c.priority}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{c.phone}</p>
                    {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button size="sm" variant="outline" onClick={() => startEdit(c)}>✏️</Button>
                    <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-50"
                      onClick={() => handleDelete(c.id)} loading={deletingId === c.id}>🗑️</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {contacts.length < 5 && !showForm && (
            <button onClick={() => setShowForm(true)}
              className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-muted-foreground hover:border-red-300 hover:text-red-600 transition-colors font-medium">
              + Add another contact ({contacts.length}/5)
            </button>
          )}
        </div>
      )}
    </div>
  )
}
