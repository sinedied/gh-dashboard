import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { MatToolbarModule } from "@angular/material/toolbar";
import { MatButtonModule } from "@angular/material/button";
import { MatIcon, MatIconRegistry } from "@angular/material/icon";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { octMarkGithub } from "@ng-icons/octicons";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [RouterOutlet, MatToolbarModule, MatButtonModule, NgIcon, MatIcon],
  providers: [provideIcons({ octMarkGithub })],
  template: `
    <mat-toolbar class="toolbar-gradient">
      <mat-icon>mystery</mat-icon>
      <span class="title">Repository Watcher</span>
      <span class="spacer"></span>
      <a mat-button href="https://github.com/sinedied/github-repository-watcher" target="_blank">
        <span class="icon">
          <ng-icon name="octMarkGithub" size="24px"></ng-icon>
          GitHub
        </span>
      </a>
    </mat-toolbar>
    <router-outlet />
  `,
  styles: [
    `
      @use "@angular/material" as mat;
      .toolbar-gradient {
        position: relative;

        @include mat.toolbar-overrides(
          (
            container-background-color: linear-gradient(to right, #1fb4fc, #039be5),
            container-text-color: #fff,
          )
        );
      }
      .title {
        margin-left: 0.5em;
      }
      .icon {
        display: flex;
        align-items: center;
        gap: 0.5em;
      }
    `,
  ],
})
export class AppComponent {
  constructor(private matIconReg: MatIconRegistry) {}

  ngOnInit(): void {
    this.matIconReg.setDefaultFontSetClass("material-symbols-outlined");
  }
}
