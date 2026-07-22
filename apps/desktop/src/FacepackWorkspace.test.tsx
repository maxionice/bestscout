// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FacepackWorkspace, type FacepackGateway } from "./FacepackWorkspace";
import { demoPlayers } from "./demo";
import type { DatabaseSnapshot, FacepackFilesystemRequest, FacepackPreview } from "./types";

afterEach(cleanup);

const snapshot: DatabaseSnapshot = {
  schema_version: 1,
  source: "synthetic",
  players: demoPlayers.map((player, index) => ({ ...player, id: `200000000${index + 1}` })),
  staff: [],
  clubs: [],
  competitions: [],
};

describe("newgen facepack workspace", () => {
  it("requires explicit newgen confirmation before preview and exact-hash installation", async () => {
    const preview = vi.fn(async () => facepackPreview());
    const install = vi.fn(async (
      _snapshot: DatabaseSnapshot,
      _request: FacepackFilesystemRequest,
      _expectedPlanHash: string,
    ) => ({
      target_directory: "/graphics/career-newgens",
      plan_hash: "a".repeat(64),
      assignment_count: 1,
      file_count: 3,
    }));
    const gateway = gatewayWith({ preview, install });
    render(<FacepackWorkspace snapshot={snapshot} gateway={gateway} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Facepack-Bildordner" }), { target: { value: "/faces" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Facepack-Zielordner" }), { target: { value: "/graphics" } });
    fireEvent.click(screen.getByRole("button", { name: `Newgen auswählen ${snapshot.players[0].name}` }));
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Exakte Zuordnungsvorschau" }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Auswahl ausdrücklich als Newgens bestätigen" }));
    fireEvent.click(screen.getByRole("button", { name: "Exakte Zuordnungsvorschau" }));

    expect(await screen.findByText("1 Zuordnungen validiert")).toBeTruthy();
    expect(preview).toHaveBeenCalledWith(snapshot, expect.objectContaining({
      source_directory: "/faces",
      destination_root: "/graphics",
      plan: expect.objectContaining({
        selected_player_ids: ["2000000001"],
        confirm_newgens: true,
      }),
    }));
    fireEvent.click(screen.getByRole("button", { name: "Atomar installieren" }));
    await waitFor(() => expect(install).toHaveBeenCalledTimes(1));
    expect(install.mock.calls[0][2]).toBe("a".repeat(64));
    expect(await screen.findByText("1 Gesichter atomar installiert und per Manifest geschützt.")).toBeTruthy();
  });

  it("requires a second action for removal and surfaces integrity refusal", async () => {
    const remove = vi.fn(async () => { throw new Error("managed facepack contains an unexpected or modified file"); });
    render(<FacepackWorkspace snapshot={snapshot} gateway={gatewayWith({ remove })} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Facepack-Zielordner" }), { target: { value: "/graphics" } });

    fireEvent.click(screen.getByRole("button", { name: "Paket entfernen" }));
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Entfernung bestätigen" }));
    expect(await screen.findByText(/Entfernung verweigert:/)).toBeTruthy();
    expect(remove).toHaveBeenCalledWith("/graphics", "career-newgens");
  });
});

function facepackPreview(): FacepackPreview {
  return {
    source_directory: "/faces",
    target_directory: "/graphics/career-newgens",
    config_xml: "<record/>",
    plan: {
      schema_version: 1,
      pack_id: "career-newgens",
      seed: "career-1",
      unused_image_count: 0,
      plan_hash: "a".repeat(64),
      assignments: [{
        player_id: "2000000001",
        player_name: snapshot.players[0].name,
        target_id: "r-2000000001",
        source_name: "face.png",
        source_sha256: "b".repeat(64),
        output_filename: "bestscout_newgen_2000000001.png",
        resource_name: "bestscout_newgen_2000000001",
      }],
    },
  };
}

function gatewayWith(overrides: Partial<FacepackGateway> = {}): FacepackGateway {
  return {
    preview: vi.fn(async () => facepackPreview()),
    install: vi.fn(async () => { throw new Error("not used"); }),
    remove: vi.fn(async () => ({ target_directory: "/graphics/career-newgens", removed_file_count: 3 })),
    ...overrides,
  };
}
