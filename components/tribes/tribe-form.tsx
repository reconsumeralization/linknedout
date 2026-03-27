"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { Tribe, TribeRole } from "@/lib/shared/types"
import { Sparkles, Target, UserPlus } from "lucide-react"

// ─── Form New Tribe Dialog ───────────────────────────────────────────────────

export const ALL_ROLES: TribeRole[] = ["Lead", "Strategist", "Executor", "Creative", "Analyst", "Connector"]

interface FormTribeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tribeName: string
  onTribeNameChange: (v: string) => void
  tribeDesc: string
  onTribeDescChange: (v: string) => void
  tribeSize: string
  onTribeSizeChange: (v: string) => void
  tribeOptimize: string
  onTribeOptimizeChange: (v: string) => void
  tribeSkills: string
  onTribeSkillsChange: (v: string) => void
  error: string | null
  isForming: boolean
  onSubmit: () => void
  onClearError: () => void
}

export function FormTribeDialog({
  open,
  onOpenChange,
  tribeName,
  onTribeNameChange,
  tribeDesc,
  onTribeDescChange,
  tribeSize,
  onTribeSizeChange,
  tribeOptimize,
  onTribeOptimizeChange,
  tribeSkills,
  onTribeSkillsChange,
  error,
  isForming,
  onSubmit,
  onClearError,
}: FormTribeDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) onClearError()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Form New Tribe with AI
          </DialogTitle>
          <DialogDescription>
            Configure your tribe. AI will generate an optimal team composition.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Tribe Name <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              value={tribeName}
              onChange={e => onTribeNameChange(e.target.value)}
              placeholder="e.g. Fintech Catalyst Crew"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Purpose / Description <span className="text-destructive">*</span></Label>
            <Textarea
              value={tribeDesc}
              onChange={e => onTribeDescChange(e.target.value)}
              placeholder="e.g. A cross-functional team for a fintech product launch with strong engineering and design..."
              className="text-xs min-h-[72px] resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Team Size</Label>
              <Select value={tribeSize} onValueChange={onTribeSizeChange}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["3", "4", "5", "6", "7", "8", "10", "12"].map(n => (
                    <SelectItem key={n} value={n} className="text-xs">{n} members</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Optimize For</Label>
              <Select value={tribeOptimize} onValueChange={onTribeOptimizeChange}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    { value: "balanced", label: "Balanced" },
                    { value: "skills", label: "Skills Depth" },
                    { value: "diversity", label: "Diversity" },
                    { value: "seniority", label: "Seniority" },
                    { value: "speed", label: "Speed" },
                  ].map(o => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Required Skills <span className="text-muted-foreground">(comma-separated)</span></Label>
            <Input
              value={tribeSkills}
              onChange={e => onTribeSkillsChange(e.target.value)}
              placeholder="e.g. React, Node.js, Product Management"
              className="h-8 text-xs"
            />
          </div>
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onClearError()
              onOpenChange(false)
            }}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={onSubmit}
            disabled={(!tribeDesc.trim() && !tribeName.trim()) || isForming}
          >
            <Sparkles className="w-3 h-3" />
            {isForming ? "Forming..." : "Form Tribe"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Assign Project Dialog ───────────────────────────────────────────────────

interface AssignProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedProject: string
  onProjectChange: (v: string) => void
  projectNames: string[]
  tribeName: string
  onAssign: () => void
}

export function AssignProjectDialog({
  open,
  onOpenChange,
  selectedProject,
  onProjectChange,
  projectNames,
  tribeName,
  onAssign,
}: AssignProjectDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Assign Project</DialogTitle>
          <DialogDescription>Link a project to {tribeName}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Project</Label>
            <Select value={selectedProject} onValueChange={onProjectChange}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {projectNames.map(p => (
                  <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={onAssign} disabled={!selectedProject}>Assign</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Add Member Dialog ───────────────────────────────────────────────────────

interface AddMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  memberName: string
  onMemberNameChange: (v: string) => void
  memberRole: TribeRole
  onMemberRoleChange: (v: TribeRole) => void
  memberSeniority: string
  onMemberSeniorityChange: (v: string) => void
  memberSkills: string
  onMemberSkillsChange: (v: string) => void
  tribeName: string
  onAdd: () => void
}

export function AddMemberDialog({
  open,
  onOpenChange,
  memberName,
  onMemberNameChange,
  memberRole,
  onMemberRoleChange,
  memberSeniority,
  onMemberSeniorityChange,
  memberSkills,
  onMemberSkillsChange,
  tribeName,
  onAdd,
}: AddMemberDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" />
            Add Member
          </DialogTitle>
          <DialogDescription>Add a new member to {tribeName}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Full Name <span className="text-destructive">*</span></Label>
            <Input
              value={memberName}
              onChange={e => onMemberNameChange(e.target.value)}
              placeholder="e.g. Alex Chen"
              className="h-8 text-xs"
              onKeyDown={e => e.key === "Enter" && onAdd()}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <Select value={memberRole} onValueChange={v => onMemberRoleChange(v as TribeRole)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_ROLES.map(r => (
                    <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Seniority</Label>
              <Select value={memberSeniority} onValueChange={onMemberSeniorityChange}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Junior", "Mid", "Senior", "Principal", "Executive"].map(s => (
                    <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Skills <span className="text-muted-foreground">(comma-separated)</span></Label>
            <Input
              value={memberSkills}
              onChange={e => onMemberSkillsChange(e.target.value)}
              placeholder="e.g. React, TypeScript, Design"
              className="h-8 text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={onAdd} disabled={!memberName.trim()}>
            Add Member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
