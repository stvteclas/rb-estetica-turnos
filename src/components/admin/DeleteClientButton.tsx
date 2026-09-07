"use client";

export default function DeleteClientButton({
  action,
}: {
  action: (formData: FormData) => Promise<void> | void;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !confirm(
            "¿Borrar a esta clienta? Si tiene turnos cargados, también se sacan de la agenda."
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <button className="btn btn-danger btn-sm" type="submit">
        Eliminar clienta
      </button>
    </form>
  );
}
