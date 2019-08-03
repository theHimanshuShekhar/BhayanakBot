import { Component, OnInit, Input } from '@angular/core';

@Component({
  selector: 'app-widget',
  templateUrl: './widget.component.html',
  styleUrls: ['./widget.component.scss']
})
export class WidgetComponent implements OnInit {
  @Input() data;

  channels;
  members;

  constructor() { }

  ngOnInit() {
    this.channels = this.data.channels.sort(compare);
    this.members = this.data.members;
    this.members.map(member => {
      if (member.channel_id) {
        this.channels.map(channel => {
          if (channel.id === member.channel_id) {
            if (!channel.members) {
              channel.members = [];
            }
            channel.members.push(member);
          }
        });
      }
    });
  }

}

function compare(a, b) {
  if (a.position < b.position) {
    return -1;
  } else {
    return 1;
  }
}
