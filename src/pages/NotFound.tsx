import { LinkIcon } from 'lucide-react';
import { EmptyState } from '../components/ui';
import { navigate } from '../lib/router';

export function NotFound({
  title = 'This link doesn’t work',
  message = 'The link may be incomplete or the plan may have been removed. Ask whoever shared it to send it again.',
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState
        icon={<LinkIcon size={24} />}
        title={title}
        actions={
          <button className="btn-primary" onClick={() => navigate('/')}>
            Go to start page
          </button>
        }
      >
        {message}
      </EmptyState>
    </div>
  );
}
