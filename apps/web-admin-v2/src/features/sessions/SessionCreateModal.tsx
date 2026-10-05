import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, MapPin, Clock } from 'lucide-react';
import { H62_createSession } from '@/api/endpoints/sessions';
import { useToast } from '@/components/ui/Toast';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';

export interface SessionCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (id: string) => void;
}

export const SessionCreateModal: React.FC<SessionCreateModalProps> = ({ open, onOpenChange, onSuccess }) => {
  const queryClient = useQueryClient();
  const { showSuccess, showError } = useToast();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [routeUrl, setRouteUrl] = useState('');
  const [scheduleType, setScheduleType] = useState<'once' | 'recurring'>('once');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('18:00');
  const [durationMin, setDurationMin] = useState(60);

  const createMutation = useMutation({
    mutationFn: H62_createSession,
    onSuccess: (data) => {
      showSuccess(`جلسه قرآنی "${data.title}" با موفقیت ایجاد شد`);
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      onOpenChange(false);
      onSuccess?.(data.id);
      setTitle('');
      setDescription('');
      setLocationLabel('');
      setRouteUrl('');
    },
    onError: (err) => showError(err, 'خطا در ایجاد جلسه'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !locationLabel.trim()) return;

    // Build ISO start and end dates
    const datePart = startDate || new Date().toISOString().split('T')[0]!;
    const startsAt = new Date(`${datePart}T${startTime}:00`).toISOString();
    const endDate = new Date(new Date(startsAt).getTime() + durationMin * 60000);
    const endsAt = endDate.toISOString();

    createMutation.mutate({
      session: {
        title: title.trim(),
        description: description.trim(),
        location: {
          label: locationLabel.trim(),
          routeUrl: routeUrl.trim() || undefined,
        },
        schedule:
          scheduleType === 'once'
            ? {
                type: 'once',
                startsAt,
                endsAt,
              }
            : {
                type: 'recurring',
                weekdays: [0, 2, 4], // Saturday, Monday, Wednesday
                timeOfDay: startTime,
                durationMin,
              },
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="ایجاد جلسه قرآنی جدید" description="جلسه در ابتدا در وضعیت پیش‌نویس (Draft) ثبت خواهد شد.">
        <form onSubmit={handleSubmit} className="space-y-4 pt-2 text-start">
          <Input
            label="عنوان جلسه"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="مثال: کارگاه آموزش تخصصی صوت و لحن"
            required
            autoFocus
          />

          <Input
            label="توضیحات و اهداف جلسه"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="مباحث، شرایط قبولی، سرفصل‌ها"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="مکان برگزاری (نام سالن، مسجد یا لینک آنلاین)"
              value={locationLabel}
              onChange={(e) => setLocationLabel(e.target.value)}
              placeholder="مثال: دارالقرآن مرکزی، سالن بصیرت"
              startIcon={<MapPin className="w-4 h-4" />}
              required
            />
            <Input
              label="آدرس مسیریابی (لینک نقشه https)"
              value={routeUrl}
              onChange={(e) => setRouteUrl(e.target.value)}
              placeholder="https://maps.google.com/..."
              normalizeDigits={false}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select
              label="نوع زمان‌بندی"
              value={scheduleType}
              onChange={(e) => setScheduleType(e.target.value as 'once' | 'recurring')}
              options={[
                { value: 'once', label: 'یک‌باره (تک جلسه)' },
                { value: 'recurring', label: 'تکرارشونده هفتگی' },
              ]}
            />
            <DatePicker
              label="تاریخ برگزاری"
              value={startDate}
              onChange={setStartDate}
            />
            <Input
              label="ساعت شروع"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              startIcon={<Clock className="w-4 h-4" />}
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              انصراف
            </Button>
            <Button
              type="submit"
              size="sm"
              loading={createMutation.isPending}
              icon={<CalendarPlus className="w-4 h-4" />}
            >
              ایجاد جلسه
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
