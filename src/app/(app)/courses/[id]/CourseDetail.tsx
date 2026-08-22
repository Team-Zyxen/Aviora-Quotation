'use client'

import React, { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/query-keys'
import { formatCurrency } from '@/lib/utils/currency'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import {
  ArrowLeft,
  GraduationCap,
  Layers,
  Edit2,
  Trash2,
  Plus,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  FileSpreadsheet,
  Banknote,
  DollarSign,
  Loader2,
  Check,
  X,
  Clock,
  Sparkles,
  AlertTriangle,
  Calendar,
  IndianRupee,
  Receipt,
  ChevronRight,
  BookOpen,
} from 'lucide-react'
import type { Course, CourseTerm, FeeHead } from '@/types/database'

export function CourseDetail() {
  const params = useParams()
  const courseId = params.id as string
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { success, error: toastError } = useToast()

  // State
  const [isEditCourseModalOpen, setIsEditCourseModalOpen] = useState(false)
  const [isAddTermModalOpen, setIsAddTermModalOpen] = useState(false)
  const [editingTerm, setEditingTerm] = useState<CourseTerm | null>(null)
  const [deletingTerm, setDeletingTerm] = useState<CourseTerm | null>(null)
  const [expandedTerms, setExpandedTerms] = useState<Record<string, boolean>>({})

  // Fee Head state
  const [addingFeeHeadTermId, setAddingFeeHeadTermId] = useState<string | null>(null)
  const [newFeeHeadLabel, setNewFeeHeadLabel] = useState('')
  const [newFeeHeadAmount, setNewFeeHeadAmount] = useState('')
  const [editingFeeHead, setEditingFeeHead] = useState<FeeHead | null>(null)

  // Fetch course with terms & fee heads
  const { data: course, isLoading, isError } = useQuery({
    queryKey: queryKeys.courses.detail(courseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('courses')
        .select(`
          id,
          name,
          description,
          duration_terms,
          created_at,
          course_terms (
            id,
            course_id,
            term_no,
            term_label,
            term_fee,
            created_at,
            fee_heads (
              id,
              course_term_id,
              label,
              amount
            )
          )
        `)
        .eq('id', courseId)
        .single()

      if (error) throw error

      const rawTerms = ((data?.course_terms || []) as unknown as CourseTerm[])
      const terms = rawTerms.sort(
        (a, b) => a.term_no - b.term_no
      )
      const total_fee = terms.reduce(
        (sum: number, t: CourseTerm) => sum + (Number(t.term_fee) || 0),
        0
      )

      return {
        ...data,
        course_terms: terms,
        terms_count: terms.length,
        total_fee,
      } as Course
    },
  })

  const toggleTerm = (termId: string) => {
    setExpandedTerms((prev) => ({
      ...prev,
      [termId]: !prev[termId],
    }))
  }

  // Update Course Mutation
  const updateCourseMutation = useMutation({
    mutationFn: async (values: { name: string; description: string; duration_terms: number }) => {
      const { error } = await supabase
        .from('courses')
        .update(values)
        .eq('id', courseId)
      if (error) throw error
    },
    onMutate: async (newValues) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.courses.detail(courseId) })
      const prev = queryClient.getQueryData<Course>(queryKeys.courses.detail(courseId))
      if (prev) {
        queryClient.setQueryData<Course>(queryKeys.courses.detail(courseId), {
          ...prev,
          ...newValues,
        })
      }
      return { prev }
    },
    onError: (err: Error, _vars, context) => {
      queryClient.setQueryData(queryKeys.courses.detail(courseId), context?.prev)
      toastError('Failed to update course', err.message)
    },
    onSuccess: () => {
      success('Course details updated')
      setIsEditCourseModalOpen(false)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.courses.detail(courseId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.courses.all })
    },
  })

  // Add / Edit Term Mutation (Optimistic)
  const saveTermMutation = useMutation({
    mutationFn: async (values: { id?: string; term_no: number; term_label: string; term_fee: number }) => {
      if (values.id) {
        const { error } = await supabase
          .from('course_terms')
          .update({
            term_no: values.term_no,
            term_label: values.term_label,
            term_fee: values.term_fee,
          })
          .eq('id', values.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('course_terms')
          .insert({
            course_id: courseId,
            term_no: values.term_no,
            term_label: values.term_label,
            term_fee: values.term_fee,
          })
        if (error) throw error
      }
    },
    onMutate: async (newTerm) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.courses.detail(courseId) })
      const prev = queryClient.getQueryData<Course>(queryKeys.courses.detail(courseId))
      if (prev) {
        let updatedTerms = [...(prev.course_terms || [])]
        if (newTerm.id) {
          updatedTerms = updatedTerms.map((t) =>
            t.id === newTerm.id ? { ...t, ...newTerm } : t
          )
        } else {
          updatedTerms.push({
            id: 'temp-' + Math.random().toString(36).substring(2, 9),
            course_id: courseId,
            term_no: newTerm.term_no,
            term_label: newTerm.term_label,
            term_fee: newTerm.term_fee,
            created_at: new Date().toISOString(),
            fee_heads: [],
          })
        }
        updatedTerms.sort((a, b) => a.term_no - b.term_no)
        const total_fee = updatedTerms.reduce((s, t) => s + (Number(t.term_fee) || 0), 0)
        queryClient.setQueryData<Course>(queryKeys.courses.detail(courseId), {
          ...prev,
          course_terms: updatedTerms,
          total_fee,
          terms_count: updatedTerms.length,
        })
      }
      return { prev }
    },
    onError: (err: Error, _vars, context) => {
      queryClient.setQueryData(queryKeys.courses.detail(courseId), context?.prev)
      toastError('Failed to save term', err.message)
    },
    onSuccess: () => {
      success(editingTerm ? 'Term updated' : 'Term added to course')
      setIsAddTermModalOpen(false)
      setEditingTerm(null)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.courses.detail(courseId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.courses.all })
    },
  })

  // Delete Term Mutation (Optimistic)
  const deleteTermMutation = useMutation({
    mutationFn: async (termId: string) => {
      const { error } = await supabase.from('course_terms').delete().eq('id', termId)
      if (error) throw error
    },
    onMutate: async (termId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.courses.detail(courseId) })
      const prev = queryClient.getQueryData<Course>(queryKeys.courses.detail(courseId))
      if (prev) {
        const updatedTerms = (prev.course_terms || []).filter((t) => t.id !== termId)
        const total_fee = updatedTerms.reduce((s, t) => s + (Number(t.term_fee) || 0), 0)
        queryClient.setQueryData<Course>(queryKeys.courses.detail(courseId), {
          ...prev,
          course_terms: updatedTerms,
          total_fee,
          terms_count: updatedTerms.length,
        })
      }
      return { prev }
    },
    onError: (err: Error, _vars, context) => {
      queryClient.setQueryData(queryKeys.courses.detail(courseId), context?.prev)
      toastError('Failed to delete term', err.message)
    },
    onSuccess: () => {
      success('Term deleted successfully')
      setDeletingTerm(null)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.courses.detail(courseId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.courses.all })
    },
  })

  // Add / Edit Fee Head Mutation
  const saveFeeHeadMutation = useMutation({
    mutationFn: async (values: { id?: string; course_term_id: string; label: string; amount: number }) => {
      if (values.id) {
        const { error } = await supabase
          .from('fee_heads')
          .update({
            label: values.label,
            amount: values.amount,
          })
          .eq('id', values.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('fee_heads')
          .insert({
            course_term_id: values.course_term_id,
            label: values.label,
            amount: values.amount,
          })
        if (error) throw error
      }
    },
    onMutate: async (newFeeHead) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.courses.detail(courseId) })
      const prev = queryClient.getQueryData<Course>(queryKeys.courses.detail(courseId))
      if (prev) {
        const updatedTerms = (prev.course_terms || []).map((t) => {
          if (t.id === newFeeHead.course_term_id) {
            let heads = [...(t.fee_heads || [])]
            if (newFeeHead.id) {
              heads = heads.map((h) =>
                h.id === newFeeHead.id ? { ...h, ...newFeeHead } : h
              )
            } else {
              heads.push({
                id: 'temp-' + Math.random().toString(36).substring(2, 9),
                course_term_id: newFeeHead.course_term_id,
                label: newFeeHead.label,
                amount: newFeeHead.amount,
              })
            }
            return { ...t, fee_heads: heads }
          }
          return t
        })
        queryClient.setQueryData<Course>(queryKeys.courses.detail(courseId), {
          ...prev,
          course_terms: updatedTerms,
        })
      }
      return { prev }
    },
    onError: (err: Error, _vars, context) => {
      queryClient.setQueryData(queryKeys.courses.detail(courseId), context?.prev)
      toastError('Failed to save fee breakup item', err.message)
    },
    onSuccess: () => {
      success('Fee item saved')
      setAddingFeeHeadTermId(null)
      setNewFeeHeadLabel('')
      setNewFeeHeadAmount('')
      setEditingFeeHead(null)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.courses.detail(courseId) })
    },
  })

  // Delete Fee Head Mutation
  const deleteFeeHeadMutation = useMutation({
    mutationFn: async ({ id }: { id: string; course_term_id: string }) => {
      const { error } = await supabase.from('fee_heads').delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, course_term_id }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.courses.detail(courseId) })
      const prev = queryClient.getQueryData<Course>(queryKeys.courses.detail(courseId))
      if (prev) {
        const updatedTerms = (prev.course_terms || []).map((t) => {
          if (t.id === course_term_id) {
            return {
              ...t,
              fee_heads: (t.fee_heads || []).filter((h) => h.id !== id),
            }
          }
          return t
        })
        queryClient.setQueryData<Course>(queryKeys.courses.detail(courseId), {
          ...prev,
          course_terms: updatedTerms,
        })
      }
      return { prev }
    },
    onError: (err: Error, _vars, context) => {
      queryClient.setQueryData(queryKeys.courses.detail(courseId), context?.prev)
      toastError('Failed to delete fee breakup item', err.message)
    },
    onSuccess: () => {
      success('Fee item removed')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.courses.detail(courseId) })
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-48" />
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
          <div className="grid grid-cols-3 gap-4 pt-4">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    )
  }

  if (isError || !course) {
    return (
      <div className="bg-white p-12 text-center rounded-xl border border-gray-200 shadow-xs space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-600">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-gray-900">Course not found</h3>
        <p className="text-sm text-gray-500">
          The requested course does not exist or has been deleted.
        </p>
        <Link
          href="/courses"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-navy-800 rounded-lg hover:bg-navy-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Courses
        </Link>
      </div>
    )
  }

  const nextTermNo = ((course.course_terms || []).length > 0
    ? Math.max(...(course.course_terms || []).map((t) => t.term_no))
    : 0) + 1

  return (
    <div className="space-y-8">
      {/* Top Breadcrumb Navigation & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/courses"
            className="p-2 text-gray-400 hover:text-navy-700 hover:bg-white rounded-lg border border-gray-200 shadow-xs transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Course Catalog
              </span>
              <span className="text-gray-300">/</span>
              <span className="text-xs font-semibold text-accent uppercase tracking-wider">
                Fee Structure
              </span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight mt-0.5">
              {course.name}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsEditCourseModalOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Edit2 className="w-4 h-4" />
            Edit Course Info
          </button>
          <button
            onClick={() => {
              setEditingTerm(null)
              setIsAddTermModalOpen(true)
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-navy-800 hover:bg-navy-900 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Term / Fee
          </button>
        </div>
      </div>

      {/* Course Overview Card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2 text-navy-700 font-medium text-sm">
              <GraduationCap className="w-4 h-4" />
              <span>Program Overview</span>
            </div>
            <p className="text-sm text-gray-600">
              {course.description || 'No description provided for this course.'}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 border-t lg:border-t-0 lg:border-l border-gray-100 lg:pl-6 pt-4 lg:pt-0">
            <div className="bg-navy-50 p-3.5 rounded-lg">
              <span className="text-xs text-navy-600 font-medium block flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> Total Duration
              </span>
              <span className="text-lg font-bold text-navy-900 mt-1 block">
                {course.duration_terms} {course.duration_terms === 1 ? 'Term' : 'Terms'}
              </span>
            </div>

            <div className="bg-blue-50 p-3.5 rounded-lg">
              <span className="text-xs text-blue-600 font-medium block flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" /> Configured Terms
              </span>
              <span className="text-lg font-bold text-blue-900 mt-1 block">
                {course.terms_count || 0} / {course.duration_terms}
              </span>
            </div>

            <div className="bg-emerald-50 p-3.5 rounded-lg col-span-2 sm:col-span-1">
              <span className="text-xs text-emerald-600 font-medium block flex items-center gap-1.5">
                <IndianRupee className="w-3.5 h-3.5" /> Total Program Fee
              </span>
              <span className="text-lg font-bold text-emerald-900 mt-1 block">
                {formatCurrency(course.total_fee || 0)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Terms & Fee Structure Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Term-Wise Fee Structure</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Each term can have a base fee, with optional detailed line-item breakups.
            </p>
          </div>
          <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            {(course.course_terms || []).length} of {course.duration_terms} terms defined
          </span>
        </div>

        {(course.course_terms || []).length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-xs">
            <div className="mx-auto w-12 h-12 rounded-full bg-navy-50 flex items-center justify-center text-navy-700 mb-4">
              <Receipt className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-gray-900">No terms configured yet</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
              Configure the terms (e.g. Semester 1, Term 1, Year 1) and their fee amounts for this course.
            </p>
            <button
              onClick={() => {
                setEditingTerm(null)
                setIsAddTermModalOpen(true)
              }}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-navy-800 rounded-lg hover:bg-navy-900 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Term 1 Fee
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {(course.course_terms || []).map((term) => {
              const isExpanded = !!expandedTerms[term.id]
              const feeHeads = term.fee_heads || []
              const feeHeadsSum = feeHeads.reduce(
                (sum, h) => sum + (Number(h.amount) || 0),
                0
              )
              const hasMismatch = feeHeads.length > 0 && Math.abs(feeHeadsSum - Number(term.term_fee)) > 0.01

              return (
                <div
                  key={term.id}
                  className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden transition-all"
                >
                  {/* Term Header Bar */}
                  <div className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleTerm(term.id)}
                        className="p-1 text-gray-400 hover:text-gray-700 rounded-md transition-colors cursor-pointer"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-5 h-5 text-navy-700" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-gray-400" />
                        )}
                      </button>

                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-navy-800 text-white font-bold text-xs">
                          T{term.term_no}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-semibold text-gray-900">
                              {term.term_label}
                            </h3>
                            {feeHeads.length > 0 && (
                              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">
                                {feeHeads.length} breakup {feeHeads.length === 1 ? 'item' : 'items'}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-gray-500">
                            Sequence: Term #{term.term_no}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-6 pl-11 sm:pl-0">
                      <div className="text-right">
                        <span className="text-xs text-gray-500 block">Term Fee</span>
                        <span className="text-base font-bold text-navy-900 block">
                          {formatCurrency(term.term_fee)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 border-l border-gray-200 pl-4">
                        <button
                          onClick={() => {
                            setEditingTerm(term)
                            setIsAddTermModalOpen(true)
                          }}
                          title="Edit Term Fee"
                          className="p-1.5 text-gray-400 hover:text-navy-700 hover:bg-gray-100 rounded-md transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeletingTerm(term)}
                          title="Delete Term"
                          className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Collapsible Fee Heads (Breakup Line Items) Section */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50/60 p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-600">
                            Fee Heads Breakup (Optional)
                          </h4>
                          <p className="text-xs text-gray-500">
                            Specify individual fee components such as Tuition, Exam Fee, Lab Charges, etc.
                          </p>
                        </div>

                        {addingFeeHeadTermId !== term.id && (
                          <button
                            onClick={() => {
                              setAddingFeeHeadTermId(term.id)
                              setEditingFeeHead(null)
                              setNewFeeHeadLabel('')
                              setNewFeeHeadAmount('')
                            }}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:text-accent-hover bg-white px-2.5 py-1.5 rounded-md border border-gray-200 shadow-2xs transition-colors cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add Fee Head
                          </button>
                        )}
                      </div>

                      {/* Add Inline Fee Head Form */}
                      {addingFeeHeadTermId === term.id && (
                        <div className="bg-white p-4 rounded-lg border border-accent/40 shadow-xs flex flex-col sm:flex-row items-end gap-3">
                          <div className="flex-1 w-full">
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Fee Head Label *
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. Tuition Fee, Exam Fee, Library"
                              value={newFeeHeadLabel}
                              onChange={(e) => setNewFeeHeadLabel(e.target.value)}
                              className="w-full text-xs rounded-md border border-gray-300 px-3 py-2 focus:ring-accent focus:border-accent"
                            />
                          </div>

                          <div className="w-full sm:w-44">
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Amount (₹) *
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              required
                              placeholder="Enter amount"
                              value={newFeeHeadAmount}
                              onChange={(e) => setNewFeeHeadAmount(e.target.value)}
                              className="w-full text-xs rounded-md border border-gray-300 px-3 py-2 focus:ring-accent focus:border-accent"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setAddingFeeHeadTermId(null)
                                setEditingFeeHead(null)
                              }}
                              className="px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={saveFeeHeadMutation.isPending || !newFeeHeadLabel || !newFeeHeadAmount}
                              onClick={() => {
                                saveFeeHeadMutation.mutate({
                                  id: editingFeeHead?.id,
                                  course_term_id: term.id,
                                  label: newFeeHeadLabel.trim(),
                                  amount: parseFloat(newFeeHeadAmount) || 0,
                                })
                              }}
                              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-white bg-navy-800 hover:bg-navy-900 rounded-md cursor-pointer disabled:opacity-50"
                            >
                              {saveFeeHeadMutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                              <Check className="w-3.5 h-3.5" />
                              Save Item
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Fee Heads List */}
                      {feeHeads.length === 0 && addingFeeHeadTermId !== term.id ? (
                        <div className="text-center py-6 bg-white rounded-lg border border-dashed border-gray-300">
                          <p className="text-xs text-gray-500">
                            No individual fee heads configured. The total term fee of {formatCurrency(term.term_fee)} applies as a single charge.
                          </p>
                        </div>
                      ) : (
                        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden divide-y divide-gray-100">
                          {feeHeads.map((head) => (
                            <div
                              key={head.id}
                              className="p-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-navy-600" />
                                <span className="font-medium text-gray-900">{head.label}</span>
                              </div>

                              <div className="flex items-center gap-4">
                                <span className="font-semibold text-gray-800">
                                  {formatCurrency(head.amount)}
                                </span>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => {
                                      setEditingFeeHead(head)
                                      setAddingFeeHeadTermId(term.id)
                                      setNewFeeHeadLabel(head.label)
                                      setNewFeeHeadAmount(head.amount.toString())
                                    }}
                                    className="p-1 text-gray-400 hover:text-navy-700 rounded cursor-pointer"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() =>
                                      deleteFeeHeadMutation.mutate({
                                        id: head.id,
                                        course_term_id: term.id,
                                      })
                                    }
                                    className="p-1 text-gray-400 hover:text-rose-600 rounded cursor-pointer"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}

                          {/* Fee Head Summary Footer */}
                          {feeHeads.length > 0 && (
                            <div className="p-3 bg-gray-50 flex items-center justify-between text-xs font-semibold">
                              <span className="text-gray-700">Total of Breakup Items:</span>
                              <div className="flex items-center gap-2">
                                <span className="text-navy-900">{formatCurrency(feeHeadsSum)}</span>
                                {hasMismatch && (
                                  <span className="text-amber-600 text-2xs bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                    Diff: {formatCurrency(Number(term.term_fee) - feeHeadsSum)}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Edit Course Modal */}
      {isEditCourseModalOpen && (
        <EditCourseModal
          course={course}
          isOpen={isEditCourseModalOpen}
          isSubmitting={updateCourseMutation.isPending}
          onClose={() => setIsEditCourseModalOpen(false)}
          onSubmit={(data) => updateCourseMutation.mutate(data)}
        />
      )}

      {/* Add / Edit Term Modal */}
      {isAddTermModalOpen && (
        <TermModal
          term={editingTerm}
          defaultTermNo={editingTerm ? editingTerm.term_no : nextTermNo}
          isOpen={isAddTermModalOpen}
          isSubmitting={saveTermMutation.isPending}
          onClose={() => {
            setIsAddTermModalOpen(false)
            setEditingTerm(null)
          }}
          onSubmit={(data) => {
            saveTermMutation.mutate({
              id: editingTerm?.id,
              ...data,
            })
          }}
        />
      )}

      {/* Delete Term Warning Modal */}
      {deletingTerm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-bold text-gray-900">Delete Term {deletingTerm.term_label}?</h3>
            </div>
            
            <p className="text-sm text-gray-600">
              Are you sure you want to remove <span className="font-semibold text-gray-900">{deletingTerm.term_label}</span> (Fee: {formatCurrency(deletingTerm.term_fee)}) from this course?
            </p>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              <p className="font-semibold">Historical Data Protection:</p>
              <p className="mt-0.5">
                Deleting this term does not affect students already enrolled with the current fee or past invoices, as all issued quotations and invoices retain their own snapshot amounts.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <button
                onClick={() => setDeletingTerm(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteTermMutation.mutate(deletingTerm.id)}
                disabled={deleteTermMutation.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer transition-colors disabled:opacity-50"
              >
                {deleteTermMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EditCourseModal({
  course,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  course: Course
  isOpen: boolean
  isSubmitting: boolean
  onClose: () => void
  onSubmit: (data: { name: string; description: string; duration_terms: number }) => void
}) {
  const [name, setName] = useState(course.name)
  const [description, setDescription] = useState(course.description || '')
  const [durationTerms, setDurationTerms] = useState(course.duration_terms)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Course name is required')
      return
    }
    setError(null)
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      duration_terms: Number(durationTerms),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl space-y-6">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <h3 className="text-lg font-bold text-gray-900">Edit Course Info</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="p-3 rounded-lg bg-rose-50 text-rose-700 text-sm">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-gray-700">Course Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs focus:ring-accent focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs focus:ring-accent focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Duration (Terms) *</label>
            <input
              type="number"
              min={1}
              max={20}
              required
              value={durationTerms}
              onChange={(e) => setDurationTerms(parseInt(e.target.value) || 1)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs focus:ring-accent focus:border-accent"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-navy-800 hover:bg-navy-900 rounded-lg cursor-pointer disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TermModal({
  term,
  defaultTermNo,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  term: CourseTerm | null
  defaultTermNo: number
  isOpen: boolean
  isSubmitting: boolean
  onClose: () => void
  onSubmit: (data: { term_no: number; term_label: string; term_fee: number }) => void
}) {
  const [termNo, setTermNo] = useState(term?.term_no ?? defaultTermNo)
  const [termLabel, setTermLabel] = useState(term?.term_label ?? `Term ${defaultTermNo}`)
  const [termFee, setTermFee] = useState(term ? term.term_fee.toString() : '')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!termLabel.trim()) {
      setError('Term label is required')
      return
    }
    const feeNumber = parseFloat(termFee)
    if (isNaN(feeNumber) || feeNumber < 0) {
      setError('Please provide a valid term fee amount')
      return
    }
    setError(null)
    onSubmit({
      term_no: Number(termNo),
      term_label: termLabel.trim(),
      term_fee: feeNumber,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-6">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <h3 className="text-lg font-bold text-gray-900">
            {term ? 'Edit Term Fee' : 'Add Course Term'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="p-3 rounded-lg bg-rose-50 text-rose-700 text-sm">{error}</div>}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700">Term No *</label>
              <input
                type="number"
                min={1}
                required
                value={termNo}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 1
                  setTermNo(val)
                  if (!term) setTermLabel(`Term ${val}`)
                }}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs focus:ring-accent focus:border-accent"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700">Term Label *</label>
              <input
                type="text"
                required
                placeholder="e.g. Semester 1, Year 1"
                value={termLabel}
                onChange={(e) => setTermLabel(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs focus:ring-accent focus:border-accent"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700">Term Fee Amount (₹) *</label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="Enter amount"
                value={termFee}
                onChange={(e) => setTermFee(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 pl-8 pr-3 py-2 text-sm shadow-xs focus:ring-accent focus:border-accent"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Base fee amount for this term. Line-item breakups can be added afterwards.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-navy-800 hover:bg-navy-900 rounded-lg cursor-pointer disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {term ? 'Update Term' : 'Save Term'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
