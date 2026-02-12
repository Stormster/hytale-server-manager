import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useDeleteInstance } from "@/api/hooks/useInstances";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceName: string | null;
}

export function DeleteInstanceDialog({
  open,
  onOpenChange,
  instanceName,
}: Props) {
  const [deleteFiles, setDeleteFiles] = useState(true);
  const deleteInstance = useDeleteInstance();

  const handleDelete = () => {
    if (!instanceName) return;
    deleteInstance.mutate(
      { name: instanceName, deleteFiles },
      {
        onSuccess: () => {
          handleClose();
        },
      }
    );
  };

  const handleClose = () => {
    setDeleteFiles(true);
    deleteInstance.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove Server Instance</DialogTitle>
          <DialogDescription>
            {instanceName
              ? `Remove "${instanceName}" from the manager?`
              : "Remove this server instance?"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start gap-3 space-x-2">
            <input
              id="delete-files"
              type="checkbox"
              checked={deleteFiles}
              onChange={(e) => setDeleteFiles(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-input"
            />
            <div className="grid gap-1.5 leading-none">
              <Label
                htmlFor="delete-files"
                className="cursor-pointer text-sm font-medium"
              >
                Delete files from disk
              </Label>
              <p className="text-xs text-muted-foreground">
                {deleteFiles
                  ? "The server folder will be permanently deleted."
                  : "Only remove from the manager. Files stay in your servers folder."}
              </p>
            </div>
          </div>

          {deleteInstance.isError && (
            <p className="text-sm text-red-500">
              {(deleteInstance.error as Error).message}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteInstance.isPending}
            >
              {deleteInstance.isPending ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
