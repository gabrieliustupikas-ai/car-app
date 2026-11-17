import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/ui/Screen';
import { EmptyState } from '@/components/ui/States';

export default function RadioScreen() {
  const { t } = useTranslation();
  return (
    <Screen title={t('radio.title')} scroll={false}>
      <EmptyState icon="radio-outline" title={t('radio.soonTitle')} body={t('radio.soonBody')} />
    </Screen>
  );
}
