'use client'
import { useEffect, useState, useRef } from 'react'
import { profileApi } from '@/lib/api'
import { getErrorMessage, getInitials } from '@/lib/utils'
import {
  Card, CardContent, Button, Input, Select, FormField,
  Alert, Spinner, Separator,
} from '@/components/ui/index'

const BLOOD_GROUPS = [
  { value: '', label: 'Select blood group…' },
  ...['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(b => ({ value: b, label: b })),
]

function TagInput({ label, values, onChange, placeholder }: {
  label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string
}) {
  const [input, setInput] = useState('')
  const add = () => {
    const val = input.trim()
    if (val && !values.includes(val)) onChange([...values, val])
    setInput('')
  }
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      <div className="flex gap-2">
        <Input placeholder={placeholder} value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <Button type="button" variant="outline" size="sm" onClick={add} className="flex-shrink-0">Add</Button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {values.map(v => (
            <span key={v} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 rounded-full px-3 py-1 text-xs font-medium">
              {v}
              <button type="button" onClick={() => onChange(values.filter(x => x !== v))}
                className="text-gray-400 hover:text-red-500 font-bold ml-0.5">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    fullName: '', dateOfBirth: '', bloodGroup: '',
    allergies: [] as string[],
    chronicConditions: [] as string[],
    currentMedications: [] as string[],
    organDonor: false, medicalNotes: '',
  })

  useEffect(() => {
    profileApi.get().then(r => {
      const p = r.data.data.profile
      setProfile(p)
      setForm({
        fullName: p.fullName || '',
        dateOfBirth: p.dateOfBirth ? p.dateOfBirth.split('T')[0] : '',
        bloodGroup: p.bloodGroup || '',
        allergies: p.allergies || [],
        chronicConditions: p.chronicConditions || [],
        currentMedications: p.currentMedications || [],
        organDonor: p.organDonor || false,
        medicalNotes: p.medicalNotes || '',
      })
    }).finally(() => setLoading(false))
  }, [])

 const handleSave = async (e: React.FormEvent) => {
  e.preventDefault()

  setSaving(true)
  setError('')
  setSuccess('')

  try {

    console.log("========== FORM DATA ==========")
    console.log(form)

    await profileApi.update(form)

    setSuccess('Profile saved successfully!')
    setTimeout(() => setSuccess(''), 3000)

  } catch (err) {
    console.error(err)
    setError(getErrorMessage(err))
  } finally {
    setSaving(false)
  }
}

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPhoto(true)
    try {
      const r = await profileApi.uploadPhoto(file)
      setProfile((p: any) => ({ ...p, photoUrl: r.data.data.photoUrl }))
    } catch (err) { setError(getErrorMessage(err)) }
    finally { setUploadingPhoto(false) }
  }

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }))

  if (loading) return <div className="flex justify-center py-20"><Spinner className="w-8 h-8 text-red-600" /></div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900">Profile & Medical Passport</h1>
        <p className="text-muted-foreground text-sm mt-1">Your medical information is revealed only after an accident is verified — never before.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {error && <Alert variant="danger">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}

        {/* Personal info */}
        <Card>
          <CardContent className="pt-5">
            <h2 className="font-bold text-base mb-4">Personal Information</h2>

            {/* Photo */}
            <div className="flex items-center gap-5 mb-5">
              <div className="relative">
                {profile?.photoUrl
                  ? <img src={profile.photoUrl} alt="Profile" className="w-20 h-20 rounded-2xl object-cover" />
                  : <div className="w-20 h-20 bg-red-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black">
                      {getInitials(form.fullName || 'U')}
                    </div>
                }
                {uploadingPhoto && (
                  <div className="absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center">
                    <Spinner className="w-5 h-5 text-white" />
                  </div>
                )}
              </div>
              <div>
                <p className="font-semibold text-sm">{form.fullName || 'Your Name'}</p>
                <Button type="button" size="sm" variant="outline" className="mt-2"
                  onClick={() => fileRef.current?.click()} loading={uploadingPhoto}>
                  📷 Change Photo
                </Button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Full Name" required>
                <Input placeholder="Your full name" value={form.fullName} onChange={set('fullName')} required />
              </FormField>
              <FormField label="Date of Birth">
                <Input type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} />
              </FormField>
            </div>
          </CardContent>
        </Card>

        {/* Medical passport */}
        <Card className="border-red-100">
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">🩺</span>
              <h2 className="font-bold text-base">Medical Passport</h2>
              <span className="ml-auto text-xs bg-red-50 text-red-600 font-semibold px-2 py-0.5 rounded-full">🔒 Private</span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Only revealed to first responders after AI verifies an accident. Never shared otherwise.
            </p>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Blood Group">
                  <Select options={BLOOD_GROUPS} value={form.bloodGroup}
                    onChange={e => setForm(p => ({ ...p, bloodGroup: e.target.value }))} />
                </FormField>
                <FormField label="Organ Donor">
                  <div className="flex items-center gap-3 h-11">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form.organDonor}
                        onChange={e => setForm(p => ({ ...p, organDonor: e.target.checked }))}
                        className="w-4 h-4 rounded text-red-600 focus:ring-red-500" />
                      <span className="text-sm">I am an organ donor</span>
                    </label>
                    <span className="text-lg">{form.organDonor ? '💚' : ''}</span>
                  </div>
                </FormField>
              </div>

              <TagInput label="Allergies" values={form.allergies} onChange={v => setForm(p => ({ ...p, allergies: v }))}
                placeholder="e.g. Penicillin, Peanuts, Latex" />

              <TagInput label="Chronic Conditions" values={form.chronicConditions}
                onChange={v => setForm(p => ({ ...p, chronicConditions: v }))}
                placeholder="e.g. Diabetes, Hypertension, Asthma" />

              <TagInput label="Current Medications" values={form.currentMedications}
                onChange={v => setForm(p => ({ ...p, currentMedications: v }))}
                placeholder="e.g. Metformin 500mg, Amlodipine 5mg" />

              <FormField label="Medical Notes">
                <textarea
                  value={form.medicalNotes}
                  onChange={e => setForm(p => ({ ...p, medicalNotes: e.target.value }))}
                  placeholder="Any additional information for emergency responders (e.g. pacemaker, recent surgery, known conditions…)"
                  rows={3}
                  className="flex w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                />
              </FormField>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" variant="danger" size="lg" className="w-full" loading={saving}>
          💾 Save Profile
        </Button>
      </form>
    </div>
  )
}
